local cjson = require "cjson.safe"
local http = require "resty.http"
local resty_hmac = require "resty.hmac"
local resty_str = require "resty.string"

-- CONFIG
local SECRET_KEY = os.getenv("CONTACT_SECRET_KEY") or "CHANGE_THIS_SECRET_KEY_IMMEDIATELY"
local SMTP2GO_KEY = os.getenv("SMTP2GO_KEY") or "REPLACE_WITH_YOUR_SMTP2GO_KEY"
local EMAIL_TO = "contact@kzoomakers.org"
local TOKEN_VALIDITY = 300  -- 5 minutes

-- Cyrillic detection (Unicode ranges: U+0400-U+04FF, U+0500-U+052F)
local function contains_cyrillic(s)
    if not s then return false end
    return ngx.re.find(s, "[\\x{0400}-\\x{04FF}\\x{0500}-\\x{052F}]", "jo") ~= nil
end

-- Validate HMAC token
local function validate_token(token, timestamp)
    if not token or not timestamp then
        return false, "missing token or timestamp"
    end
    
    -- Check timestamp validity (not too old, not in future)
    local now = ngx.time()
    local ts = tonumber(timestamp)
    
    if not ts then
        return false, "invalid timestamp format"
    end
    
    if ts > now + 60 then
        return false, "timestamp in future"
    end
    
    if now - ts > TOKEN_VALIDITY then
        return false, "token expired"
    end
    
    -- Recreate expected signature
    local token_data = timestamp .. ":contact"
    local hmac = resty_hmac:new(SECRET_KEY, resty_hmac.ALGOS.SHA256)
    
    if not hmac then
        return false, "hmac init failed"
    end
    
    hmac:update(token_data)
    local expected_sig = resty_str.to_hex(hmac:final())
    
    -- Compare signatures (constant-time comparison would be better)
    if token ~= expected_sig then
        return false, "invalid token signature"
    end
    
    return true
end

-- Read and parse body
ngx.req.read_body()
local raw = ngx.req.get_body_data()

if not raw then
    ngx.status = 400
    ngx.say("missing body")
    return
end

local data, err = cjson.decode(raw)
if not data then
    ngx.status = 400
    ngx.say("invalid json: " .. (err or "unknown"))
    return
end

-- Validate token
local valid, err_msg = validate_token(data.token, data.timestamp)
if not valid then
    ngx.status = 403
    ngx.say("authentication failed: " .. err_msg)
    return
end

-- Extract fields
local name = data.name or ""
local email = data.email or ""
local message = data.message or ""

-- Validate field lengths
if #name > 100 or #email > 100 or #message > 5000 then
    ngx.status = 400
    ngx.say("field too long")
    return
end

-- Check for Cyrillic
if contains_cyrillic(name) or contains_cyrillic(email) or contains_cyrillic(message) then
    ngx.status = 422
    ngx.say("cyrillic characters not allowed")
    return
end

-- Basic validation
if #name < 1 or #email < 3 or not email:find("@") or #message < 1 then
    ngx.status = 400
    ngx.say("invalid fields")
    return
end

-- Build SMTP2GO request
local email_payload = {
    api_key = SMTP2GO_KEY,
    to = {
        { email = EMAIL_TO }
    },
    sender = "noreply@kzoomakers.org",
    subject = "Contact Form: " .. name,
    text_body = string.format(
        "Contact Form Submission\n\n" ..
        "From: %s\n" ..
        "Email: %s\n\n" ..
        "Message:\n%s",
        name, email, message
    ),
    html_body = string.format(
        "<h2>Contact Form Submission</h2>" ..
        "<p><strong>From:</strong> %s</p>" ..
        "<p><strong>Email:</strong> %s</p>" ..
        "<h3>Message:</h3>" ..
        "<p>%s</p>",
        ngx.escape_html(name),
        ngx.escape_html(email),
        ngx.escape_html(message):gsub("\n", "<br>")
    )
}

-- Send to SMTP2GO
local httpc = http.new()
httpc:set_timeout(10000)  -- 10 second timeout

local res, err = httpc:request_uri(
    "https://api.smtp2go.com/v3/email/send",
    {
        method = "POST",
        body = cjson.encode(email_payload),
        headers = {
            ["Content-Type"] = "application/json"
        },
        ssl_verify = true
    }
)

if not res then
    ngx.log(ngx.ERR, "SMTP2GO request failed: ", err)
    ngx.status = 502
    ngx.say("email service unavailable")
    return
end

if res.status ~= 200 then
    ngx.log(ngx.ERR, "SMTP2GO rejected: ", res.status, " ", res.body)
    ngx.status = 502
    ngx.say("email delivery failed")
    return
end

-- Success
ngx.status = 200
ngx.say("message sent successfully")