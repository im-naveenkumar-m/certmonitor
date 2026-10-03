def certificate_changed(old_fingerprint: str, new_fingerprint: str) -> bool:
    return old_fingerprint != new_fingerprint


def test_certificate_unchanged():
    old = "ABC123"
    new = "ABC123"

    assert certificate_changed(old, new) is False


def test_certificate_changed():
    old = "ABC123"
    new = "DEF456"

    assert certificate_changed(old, new) is True


print("Unchanged:", certificate_changed("ABC123", "ABC123"))
print("Changed:", certificate_changed("ABC123", "DEF456"))