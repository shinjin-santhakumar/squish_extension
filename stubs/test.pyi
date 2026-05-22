class _Test:
    """Squish test result recording object. Available as the global 'test'."""

    def compare(self, value1, value2, msg: str = ""):
        """Verify value1 == value2. Records PASS or FAIL in the test log."""
        ...

    def xcompare(self, value1, value2, msg: str = ""):
        """Expected-failure compare: XFAIL if values differ, XPASS if equal."""
        ...

    def verify(self, expression, msg: str = ""):
        """Verify that expression is truthy. Records PASS or FAIL."""
        ...

    def xverify(self, expression, msg: str = ""):
        """Expected-failure verify: XFAIL if expression is falsy, XPASS if truthy."""
        ...

    def fail(self, msg: str):
        """Unconditionally record a FAIL result with the given message."""
        ...

    def xfail(self, msg: str):
        """Unconditionally record an XFAIL (expected failure) result."""
        ...

    def warning(self, msg: str):
        """Record a WARNING in the test log without affecting pass/fail status."""
        ...

    def log(self, msg: str):
        """Write an informational message to the test log."""
        ...

    def passes(self, msg: str = ""):
        """Unconditionally record a PASS result."""
        ...

    def error(self, msg: str):
        """Record an ERROR result. Deprecated — prefer fail()."""
        ...

    def exception(self, expression, exceptionType=None, msg: str = ""):
        """Verify that calling expression raises an exception of exceptionType."""
        ...

    def imagePresent(self, image, objectOrArea=None, threshold: float = 0.95):
        """Verify that the given image is found on screen within objectOrArea."""
        ...

    def imageNotPresent(self, image, objectOrArea=None, threshold: float = 0.95):
        """Verify that the given image is NOT found on screen within objectOrArea."""
        ...

    def screenshot(self, objectOrArea=None, fileName: str = ""):
        """Capture a screenshot and attach it to the test result report."""
        ...

    def startSection(self, name: str):
        """Begin a named section in the test result report."""
        ...

    def endSection(self, name: str = ""):
        """End the current named section in the test result report."""
        ...

    def fixateResultContext(self, steps: int):
        """Attribute the next N result entries to the caller's stack frame."""
        ...


test: _Test
