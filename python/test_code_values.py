from code_values import encode_value, decode_value


def test_encode_decode():
    for original in ("foo", 1.5, 137, True, False, None, b"abc"):
        encoded = encode_value(original)
        decoded = decode_value(encoded)
        assert decoded == original, "%r != %r" % (decoded, original)


def test_tuple():
    original = ("foo", 1.5, 137, True, False, None, b"abc")
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)
    print(original)
    print(decoded)


def test_document():
    keys = ("foo", 1.5, 137, True, False, None, b"abc")
    original = {key: key for key in keys}
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)


def test_compound():
    original = {
        "foo": "bar",
        "cheese": [1, 2, False],
        #"never": {"back": "together"},
        #1.7: [[], {None: 3}],
    }
    encoded = encode_value(original)
    decoded = decode_value(encoded)
    assert decoded == original, "%r != %r" % (decoded, original)
