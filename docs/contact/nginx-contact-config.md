# OpenResty Contact Form Configuration Guide

## Overview

This guide will help you set up a secure contact form endpoint using OpenResty with Lua, SMTP2GO API integration, Cyrillic filtering, and HMAC-based token authentication.

## Security Features

✅ **HMAC-SHA256 signed tokens** - Cryptographically secure authentication  
✅ **5-minute token expiration** - Prevents token reuse  
✅ **Timestamp validation** - Prevents replay attacks  
✅ **Cyrillic character filtering** - Blocks unwanted character sets  
✅ **Rate limiting** - Prevents abuse (10 requests/minute per IP)  
✅ **Input validation** - Sanitizes all user input  
✅ **No client-side secrets** - All security logic server-side  
✅ **HTTPS required** - Encrypted communication  

---

## Prerequisites

### 1. Install Required Lua Modules

You need these OpenResty/Lua modules:

```bash
# Using luarocks
luarocks install lua-resty-http
luarocks install lua-resty-hmac
luarocks install lua-resty-string
```

Or using OpenResty Package Manager (opm):

```bash
opm get ledgetech/lua-resty-http
opm get jkeys089/lua-resty-hmac
opm get openresty/lua-resty-string
```

### 2. Get SMTP2GO API Key

1. Sign up at [https://www.smtp2go.com](https://www.smtp2go.com)
2. Navigate to Settings → API Keys
3. Create a new API key with "Send Email" permission
4. Save the API key securely

---

## Installation Steps

### Step 1: Set Environment Variables

Add these to your environment or Docker configuration:

```bash
# Generate a strong random secret key (example using openssl)
export CONTACT_SECRET_KEY=$(openssl rand -hex 32)

# Your SMTP2GO API key
export SMTP2GO_KEY="api-XXXXXXXXXXXXXXXXXXXXXXXX"
```

**For Docker/Docker Compose**, add to your `docker-compose.yml`:

```yaml
services:
  nginx:
    environment:
      - CONTACT_SECRET_KEY=your-very-long-random-secret-key-here
      - SMTP2GO_KEY=api-XXXXXXXXXXXXXXXXXXXXXXXX
```

**For systemd**, add to `/etc/systemd/system/nginx.service.d/override.conf`:

```ini
[Service]
Environment="CONTACT_SECRET_KEY=your-very-long-random-secret-key-here"
Environment="SMTP2GO_KEY=api-XXXXXXXXXXXXXXXXXXXXXXXX"
```

### Step 2: Copy Lua Files

Copy the Lua files to your nginx configuration directory:

```bash
# Create lua directory if it doesn't exist
mkdir -p /etc/nginx/lua

# Copy the files (adjust paths as needed)
cp lua/contact_token.lua /etc/nginx/lua/
cp lua/contact.lua /etc/nginx/lua/

# Set proper permissions
chmod 644 /etc/nginx/lua/contact_token.lua
chmod 644 /etc/nginx/lua/contact.lua
```

### Step 3: Copy HTML File

Copy the contact form HTML to your web root:

```bash
# Copy to your nginx html directory
cp contact.html /usr/share/nginx/html/

# Set proper permissions
chmod 644 /usr/share/nginx/html/contact.html
```

### Step 4: Configure Nginx

#### Add Rate Limiting (in `http` block)

Add this to the `http` block in your main `nginx.conf` (outside any `server` blocks):

```nginx
http {
    # ... existing config ...
    
    # Rate limit: 10 requests per minute per IP for contact form
    limit_req_zone $binary_remote_addr zone=contact_limit:10m rate=10r/m;
    
    # ... rest of config ...
}
```

#### Add Location Blocks (in `server` block)

Add these location blocks to your **HTTPS server block** (the one listening on port 443):

```nginx
server {
    listen 443 ssl;
    server_name kzoomakers.org www.kzoomakers.org;
    client_max_body_size 200M;

    ssl_certificate     /etc/letsencrypt/live/kzoomakers.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kzoomakers.org/privkey.pem;

    root /usr/share/nginx/html;
    index index.html;

    # ============================================
    # CONTACT FORM ENDPOINTS - ADD THESE
    # ============================================
    
    # Token generation endpoint
    location = /contact-token {
        content_by_lua_file /etc/nginx/lua/contact_token.lua;
    }

    # Contact form submission endpoint
    location = /contact {
        # Rate limiting: 10 requests per minute, allow burst of 5
        limit_req zone=contact_limit burst=5 nodelay;
        
        content_by_lua_file /etc/nginx/lua/contact.lua;
    }
    
    # ============================================
    # END CONTACT FORM ENDPOINTS
    # ============================================

    # ... your existing locations (cal.ics, webhook, news, etc.) ...
}
```

### Step 5: Test Configuration

Test nginx configuration before reloading:

```bash
nginx -t
```

If successful, reload nginx:

```bash
# For systemd
systemctl reload nginx

# For Docker
docker-compose restart nginx

# Or send reload signal
nginx -s reload
```

---

## Testing

### Test 1: Token Generation

```bash
curl https://kzoomakers.org/contact-token
```

**Expected response:**
```json
{"token":"a1b2c3d4e5f6...","timestamp":1733294400}
```

### Test 2: Form Submission

```bash
# Fetch token
TOKEN_DATA=$(curl -s https://kzoomakers.org/contact-token)
TOKEN=$(echo $TOKEN_DATA | jq -r '.token')
TIMESTAMP=$(echo $TOKEN_DATA | jq -r '.timestamp')

# Submit form
curl -X POST https://kzoomakers.org/contact \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test User\",
    \"email\": \"test@example.com\",
    \"message\": \"This is a test message from the contact form.\",
    \"token\": \"$TOKEN\",
    \"timestamp\": $TIMESTAMP
  }"
```

**Expected response:**
```
message sent successfully
```

### Test 3: Cyrillic Filtering

```bash
TOKEN_DATA=$(curl -s https://kzoomakers.org/contact-token)
TOKEN=$(echo $TOKEN_DATA | jq -r '.token')
TIMESTAMP=$(echo $TOKEN_DATA | jq -r '.timestamp')

curl -X POST https://kzoomakers.org/contact \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Тест\",
    \"email\": \"test@example.com\",
    \"message\": \"Test\",
    \"token\": \"$TOKEN\",
    \"timestamp\": $TIMESTAMP
  }"
```

**Expected response:**
```
cyrillic characters not allowed
```

### Test 4: Token Expiration

```bash
# Use an old timestamp (should fail)
curl -X POST https://kzoomakers.org/contact \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test\",
    \"email\": \"test@example.com\",
    \"message\": \"Test\",
    \"token\": \"invalid\",
    \"timestamp\": 1000000000
  }"
```

**Expected response:**
```
authentication failed: token expired
```

---

## Troubleshooting

### Check Nginx Error Logs

```bash
# View recent errors
tail -f /var/log/nginx/error.log

# For Docker
docker logs -f nginx_container_name
```

### Common Issues

#### "HMAC initialization failed"
- **Cause**: Missing `lua-resty-hmac` module
- **Solution**: Install the module using luarocks or opm

#### "email service unavailable"
- **Cause**: SMTP2GO_KEY not set or invalid
- **Solution**: Check environment variable is set correctly

#### "authentication failed: token expired"
- **Cause**: Token older than 5 minutes or system time mismatch
- **Solution**: Ensure server time is correct, fetch fresh token

#### "cyrillic characters not allowed"
- **Cause**: Input contains Cyrillic characters (U+0400-U+052F)
- **Solution**: This is expected behavior - use only Latin characters

#### Rate limit errors (429)
- **Cause**: More than 10 requests per minute from same IP
- **Solution**: Wait 60 seconds or adjust rate limit in nginx.conf

---

## File Structure

After installation, your file structure should look like:

```
/etc/nginx/
├── nginx.conf                    # Main config with rate limiting
├── lua/
│   ├── contact_token.lua        # Token generation
│   └── contact.lua              # Form submission handler

/usr/share/nginx/html/
├── contact.html                 # Contact form frontend
└── ... (other html files)
```

---

## Security Considerations

### What This Solution Provides

1. **Token-based authentication**: Each form submission requires a fresh, signed token
2. **Time-limited tokens**: Tokens expire after 5 minutes
3. **Replay attack prevention**: Timestamps prevent token reuse
4. **Rate limiting**: Prevents brute force and spam
5. **Input validation**: All fields are validated and sanitized
6. **Cyrillic filtering**: Blocks unwanted character sets

### What You Should Still Consider

1. **CAPTCHA**: For additional bot protection, consider adding reCAPTCHA or hCaptcha
2. **IP blocking**: Monitor logs and block abusive IPs at firewall level
3. **Email validation**: Consider adding email verification for critical forms
4. **Monitoring**: Set up alerts for unusual activity patterns
5. **Backup contact method**: Provide alternative contact (phone, social media)

---

## Customization

### Change Token Validity Period

Edit `/etc/nginx/lua/contact.lua`:

```lua
local TOKEN_VALIDITY = 300  -- Change to desired seconds (e.g., 600 for 10 minutes)
```

### Change Rate Limit

Edit `nginx.conf` in the `http` block:

```nginx
# Change rate (e.g., 20r/m for 20 requests per minute)
limit_req_zone $binary_remote_addr zone=contact_limit:10m rate=20r/m;
```

And in the location block:

```nginx
location = /contact {
    limit_req zone=contact_limit burst=10 nodelay;  # Change burst value
    content_by_lua_file /etc/nginx/lua/contact.lua;
}
```

### Change Recipient Email

Edit `/etc/nginx/lua/contact.lua`:

```lua
local EMAIL_TO = "your-email@example.com"  -- Change to your email
```

### Customize Email Format

Edit the `email_payload` section in `/etc/nginx/lua/contact.lua` to modify subject line, body format, etc.

---

## Maintenance

### Rotate Secret Key

To rotate the secret key (recommended every 6-12 months):

1. Generate new key: `openssl rand -hex 32`
2. Update environment variable
3. Reload nginx: `systemctl reload nginx`
4. Old tokens will immediately become invalid (users will get new ones automatically)

### Monitor SMTP2GO Usage

Check your SMTP2GO dashboard regularly to:
- Monitor email sending volume
- Check for delivery failures
- Review API usage limits

### Log Monitoring

Set up log monitoring for:
- Failed authentication attempts
- Rate limit violations
- SMTP2GO errors
- Cyrillic detection events

---

## Support

For issues specific to:
- **OpenResty/Nginx**: Check [OpenResty documentation](https://openresty.org/en/)
- **SMTP2GO**: Contact [SMTP2GO support](https://www.smtp2go.com/support/)
- **This implementation**: Review error logs and test each component individually

---

## Complete Example Configuration

Here's your complete HTTPS server block with contact form integrated:

```nginx
server {
    listen 443 ssl;
    server_name kzoomakers.org www.kzoomakers.org;
    client_max_body_size 200M;

    ssl_certificate     /etc/letsencrypt/live/kzoomakers.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kzoomakers.org/privkey.pem;

    root /usr/share/nginx/html;
    index index.html;

    # Contact form token generation
    location = /contact-token {
        content_by_lua_file /etc/nginx/lua/contact_token.lua;
    }

    # Contact form submission
    location = /contact {
        limit_req zone=contact_limit burst=5 nodelay;
        content_by_lua_file /etc/nginx/lua/contact.lua;
    }

    # Your existing purge endpoints
    location ~ /purgeit/(.*) {
        allow all;
        content_by_lua_block {
            local cache_key = ngx.var[1]
            local cache_path = "/var/cache/nginx/" .. cache_key
            os.remove(cache_path)
            ngx.say("Purged: ", cache_key)
        }
    }

    location = /purge/cal.ics {
        allow 127.0.0.1;
        allow all;
        content_by_lua_block {
            local cache_root = "/var/cache/nginx/ics_cache"
            local target = "d3be6155ce419d2da7f502944f801ab1"
            local cmd = string.format("find %s -type f -name '%s*' -delete", cache_root, target)
            os.execute(cmd)
            ngx.say("Purged files matching: ", target)
        }
    }

    # Calendar endpoint
    location = /cal.ics {
        proxy_ignore_headers Cache-Control Expires Set-Cookie;
        proxy_cache            ics_zone;
        proxy_cache_valid      200 2d;
        proxy_cache_use_stale  error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_pass https://calendar.google.com/calendar/ical/kzoomakers.org_fkmebp59ti7pvl271vp65p1k8s%40group.calendar.google.com/public/basic.ics;
        proxy_method GET;
        proxy_intercept_errors off;
        proxy_set_header Host calendar.google.com;
        add_header X-Makers-Cache-Status $upstream_cache_status;
        add_header Content-Type text/calendar;
        add_header Content-Disposition 'attachment; filename="cal.ics"';
    }

    # Webhook endpoint
    location /webhook {
        proxy_pass http://webhook_listener:7999;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Content-Length $content_length;
        proxy_set_header Content-Type $content_type;
        proxy_request_buffering off;
        proxy_buffering off;
    }

    # WordPress news section
    location /news/ {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        rewrite ^/news/(.*)$ /$1 break;
        proxy_pass http://wp-nginx:9001;
    }

    # Docker stats
    location /docker.nfo/ {
        proxy_set_header Accept-Encoding "";
        proxy_pass http://stats:8080/;
    }

    # Default location
    location / {
        try_files $uri $uri/ =404;
    }
}
```

---

## Quick Start Checklist

- [ ] Install required Lua modules (lua-resty-http, lua-resty-hmac, lua-resty-string)
- [ ] Get SMTP2GO API key
- [ ] Set environment variables (CONTACT_SECRET_KEY, SMTP2GO_KEY)
- [ ] Copy Lua files to `/etc/nginx/lua/`
- [ ] Copy `contact.html` to `/usr/share/nginx/html/`
- [ ] Add rate limiting to `http` block in nginx.conf
- [ ] Add location blocks to HTTPS server block
- [ ] Test nginx configuration: `nginx -t`
- [ ] Reload nginx
- [ ] Test token generation endpoint
- [ ] Test form submission
- [ ] Test Cyrillic filtering
- [ ] Monitor logs for any issues

---

**Installation complete!** Your secure contact form is now ready to use at `https://kzoomakers.org/contact.html`