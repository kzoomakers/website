local cjson = require "cjson.safe"
local resty_hmac = require "resty.hmac"
local resty_str = require "resty.string"

-- SECRET KEY - Store this securely, preferably in environment variable
local SECRET_KEY = os.getenv("CONTACT_SECRET_KEY") or "CHANGE_THIS_SECRET_KEY_IMMEDIATELY"

-- Generate timestamp
local timestamp = ngx.time()

-- Create token data
local token_data = timestamp .. ":contact"

-- Generate HMAC signature
local hmac = resty_hmac:new(SECRET_KEY, resty_hmac.ALGOS.SHA256)
if not hmac then
    ngx.status = 500
    ngx.say("HMAC initialization failed")
    return
end

local ok = hmac:update(token_data)
if not ok then
    ngx.status = 500
    ngx.say("HMAC update failed")
    return
end

local signature = hmac:final()
local hex_signature = resty_str.to_hex(signature)

-- Return token and timestamp
ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
    token = hex_signature,
    timestamp = timestamp
}))