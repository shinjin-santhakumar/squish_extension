def waitForObject(objectOrName, timeoutMS: int = -1):
    """Wait until the object is available and return it. Raises LookupError on timeout."""
    ...

def waitForObjectExists(objectOrName, timeoutMS: int = -1):
    """Wait until the object exists (may be invisible) and return it."""
    ...

def findObject(objectOrName):
    """Find and return the object immediately without waiting."""
    ...

def mouseClick(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0, button: int = 1):
    """Simulate a single mouse click on the object at (x, y)."""
    ...

def mouseDoubleClick(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0, button: int = 1):
    """Simulate a double mouse click on the object at (x, y)."""
    ...

def mouseDrag(objectOrName, startX: int, startY: int, stopX: int, stopY: int, modifiers: int = 0, button: int = 1):
    """Simulate dragging the mouse from (startX, startY) to (stopX, stopY)."""
    ...

def mousePress(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0, button: int = 1):
    """Simulate pressing a mouse button without releasing."""
    ...

def mouseRelease(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0, button: int = 1):
    """Release a previously pressed mouse button."""
    ...

def mouseMove(objectOrName, x: int = -1, y: int = -1):
    """Move the mouse cursor to (x, y) over the object."""
    ...

def type(objectOrName, text: str):
    """Type the given text into the object using keyboard events."""
    ...

def keyClick(objectOrName, key, modifiers: int = 0):
    """Simulate a key press and release on the object."""
    ...

def keyPress(objectOrName, key, modifiers: int = 0):
    """Simulate pressing a key without releasing it."""
    ...

def keyRelease(objectOrName, key, modifiers: int = 0):
    """Release a previously pressed key."""
    ...

def tapObject(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0):
    """Perform a tap (touch) gesture on the object."""
    ...

def longPress(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0):
    """Perform a long-press touch gesture on the object."""
    ...

def flick(objectOrName, x: int, y: int, deltaX: int, deltaY: int, modifiers: int = 0):
    """Perform a flick (swipe) gesture starting at (x, y)."""
    ...

def dragAndDrop(objectOrName, x: int, y: int, destObjectOrName, destX: int, destY: int, modifiers: int = 0):
    """Drag from the source object to the destination object."""
    ...

def snooze(seconds: float):
    """Pause script execution for the given number of seconds."""
    ...

def currentApplicationContext():
    """Return the ApplicationContext of the currently active application under test."""
    ...

def startApplication(applicationName: str):
    """Start the named application and return its ApplicationContext."""
    ...

def attachToApplication(applicationName: str):
    """Attach to a running application and return its ApplicationContext."""
    ...

def closeApplication(context=None):
    """Close the application under test."""
    ...

def setForegroundWindow(objectOrName):
    """Bring the window of the given object to the foreground."""
    ...

def grabWidget(objectOrName) -> str:
    """Capture a screenshot of the widget and return the saved image path."""
    ...

def captureScreenshot(objectOrName=None, fileName: str = "") -> str:
    """Save a screenshot of objectOrName (or the full screen) to fileName."""
    ...

def getQtVersion() -> str:
    """Return the Qt version string of the application under test."""
    ...

def waitForSignal(objectOrName, signal: str, timeoutMS: int = -1):
    """Wait until the named signal is emitted by the object."""
    ...

def installEventHandler(objectOrName, signal: str, handler):
    """Register handler to be called whenever signal is emitted by the object."""
    ...

def removeEventHandler(objectOrName, signal: str, handler):
    """Remove a previously installed event handler."""
    ...

def nativeType(text: str):
    """Type text using native OS input events, bypassing the Qt event system."""
    ...

def nativeMouseClick(x: int, y: int, modifiers: int = 0, button: int = 1):
    """Perform a native OS mouse click at absolute screen coordinates."""
    ...

def activeWindow():
    """Return the currently active (foreground) top-level window object."""
    ...

def waitForObjectItem(objectOrName, item, timeoutMS: int = -1):
    """Wait for an item (row/column/cell) inside a container object to become available."""
    ...

def clickButton(objectOrName):
    """Simulate clicking a push button."""
    ...

def activateItem(objectOrName, item: str):
    """Activate an item in a menu, tree, or list by its text."""
    ...

def selectOption(objectOrName, option: str):
    """Select an option from a combo box by its text."""
    ...

def clearText(objectOrName):
    """Clear the text content of a text input object."""
    ...

def doubleClick(objectOrName, x: int = -1, y: int = -1, modifiers: int = 0, button: int = 1):
    """Simulate a double-click. Alias for mouseDoubleClick."""
    ...

def invokeMenuAction(objectOrName, actionPath: str):
    """Trigger a menu action by its path (e.g. 'File|Save')."""
    ...

def openContextMenu(objectOrName, x: int = -1, y: int = -1):
    """Open the context menu of the object at (x, y)."""
    ...


class MouseButton:
    """Mouse button constants for use with mouse event functions."""
    NoButton: int
    LeftButton: int
    RightButton: int
    MiddleButton: int
    BackButton: int
    ForwardButton: int


class Modifier:
    """Keyboard modifier constants for use with mouse and key event functions."""
    NoModifier: int
    ShiftModifier: int
    ControlModifier: int
    AltModifier: int
    MetaModifier: int


class Key:
    """Keyboard key constants for use with keyClick, keyPress, keyRelease."""
    Return: int
    Enter: int
    Tab: int
    Backspace: int
    Delete: int
    Escape: int
    Space: int
    Up: int
    Down: int
    Left: int
    Right: int
    Home: int
    End: int
    PageUp: int
    PageDown: int
    Insert: int
    F1: int
    F2: int
    F3: int
    F4: int
    F5: int
    F6: int
    F7: int
    F8: int
    F9: int
    F10: int
    F11: int
    F12: int
