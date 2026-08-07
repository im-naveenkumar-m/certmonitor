from app.auth.jwt import create_access_token, decode_token

token = create_access_token("admin")

print(token)

print(decode_token(token))