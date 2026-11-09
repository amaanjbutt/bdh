"""Prepare a short-lived upload for one staged release without logging its URL."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings
from scripts.r2_snapshot import client


def encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def encrypt_url(public_key: rsa.RSAPublicKey, url: str) -> str:
    key = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    encrypted_key = public_key.encrypt(
        key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    )
    return json.dumps({
        "key": encode(encrypted_key),
        "nonce": encode(nonce),
        "ciphertext": encode(AESGCM(key).encrypt(nonce, url.encode(), None)),
    }, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("digest")
    parser.add_argument("public_key")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{64}", args.digest):
        parser.error("a SHA-256 digest is required")
    public_key = serialization.load_der_public_key(base64.b64decode(args.public_key, validate=True))
    if not isinstance(public_key, rsa.RSAPublicKey) or public_key.key_size not in {2048, 3072, 4096}:
        parser.error("expected a 2048, 3072, or 4096-bit RSA public key")

    url = client().generate_presigned_url(
        "put_object", Params={"Bucket": settings.r2_bucket, "Key": f"raw/manual/{args.digest}.zip"},
        ExpiresIn=900,
    )
    print("STAGED_UPLOAD_ENVELOPE=" + encrypt_url(public_key, url))


if __name__ == "__main__":
    main()
