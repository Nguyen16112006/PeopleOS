# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import hashlib
import hmac
import ipaddress
import secrets
import socket
from urllib.parse import urlparse

import jwt
from cryptography.fernet import Fernet

from .db import ApiError


# ---- API key ------------------------------------------------------------------
def new_api_key(env: str) -> tuple[str, str]:
    """Trả về (khóa đầy đủ, prefix). Định dạng: pos_<live|test>_<prefix8>_<bí mật>."""
    prefix = secrets.token_hex(4)
    tag = "live" if env == "live" else "test"
    return f"pos_{tag}_{prefix}_{secrets.token_urlsafe(24)}", prefix


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# ---- Secret webhook (mã hóa ở trạng thái nghỉ) ----------------------------------
def new_webhook_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def encrypt(secret_key: str, text: str) -> str:
    return Fernet(secret_key.encode()).encrypt(text.encode()).decode()


def decrypt(secret_key: str, token: str) -> str:
    return Fernet(secret_key.encode()).decrypt(token.encode()).decode()


def sign_payload(secret: str, timestamp: int, body: str) -> str:
    """X-PeopleOS-Signature = t=<epoch>,v1=<hex HMAC-SHA256(secret, '<t>.<body>')>."""
    mac = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={mac}"


# ---- Chống SSRF cho URL webhook ---------------------------------------------------
def _bad_ip(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
            or ip.is_reserved or ip.is_unspecified)


def assert_public_url(url: str, allow_private: bool = False, allow_http: bool = False) -> None:
    """Chặn URL trỏ vào mạng nội bộ. Gọi lúc đăng ký VÀ ngay trước mỗi lần giao.
    Lưu ý: vẫn còn khoảng hở DNS-rebinding giữa lúc kiểm tra và lúc kết nối; khi chạy thật nên
    cho worker đi qua egress proxy chỉ cho phép địa chỉ công cộng."""
    u = urlparse(url)
    if u.scheme not in (("https", "http") if allow_http else ("https",)):
        raise ApiError(422, "URL webhook phải dùng https")
    host = u.hostname
    if not host or u.username or u.password:
        raise ApiError(422, "URL webhook không hợp lệ")
    if allow_private:
        return
    if host.lower() in ("localhost",) or host.lower().endswith((".local", ".internal")):
        raise ApiError(422, "URL webhook không được trỏ vào mạng nội bộ")
    try:
        infos = socket.getaddrinfo(host, u.port or (443 if u.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ApiError(422, "Không phân giải được tên miền của URL webhook")
    for info in infos:
        if _bad_ip(ipaddress.ip_address(info[4][0])):
            raise ApiError(422, "URL webhook không được trỏ vào mạng nội bộ")


# ---- JWT của developer (realm peopleos-platform) -----------------------------------
class JwtVerifier:
    def __init__(self, jwks_url: str, issuer: str):
        self._jwks = jwt.PyJWKClient(jwks_url, cache_keys=True)
        self._issuer = issuer

    def __call__(self, token: str) -> dict:
        try:
            key = self._jwks.get_signing_key_from_jwt(token).key
            return jwt.decode(token, key, algorithms=["RS256"], issuer=self._issuer,
                              options={"verify_aud": False, "require": ["exp", "sub"]})
        except Exception:
            raise ApiError(401, "Token không hợp lệ hoặc đã hết hạn")
