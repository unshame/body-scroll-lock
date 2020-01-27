// https://github.com/willmcpo/body-scroll-lock
// Updated to allow checking multiple elements for scrollability

// Older browsers don't support event options, feature detect it.

// Adopted and modified solution from Bohdan Didukh (2017)
// https://stackoverflow.com/questions/41594997/ios-10-safari-prevent-scrolling-behind-a-fixed-overlay-and-maintain-scroll-posi

var hasPassiveEvents = require('./check-passive-events')();

var isIosDevice = window.navigator.userAgent.match(/iPhone|iPad|iPod/) && !window.MSStream;

var locks = [];
var paddableElementSelectors = [];
var paddedElements = [];
var documentListenerAdded = false;
var initialClientY = -1;
var initialClientX = -1;
var previousBodyOverflowSetting = null;
var previousBodyPaddingRight = null;

// returns true if `el` should be allowed to receive touchmove events
function allowTouchMove(event) {
    var el = event.target;
    return locks.some(function(lock) {

        if (!lock.options.allowTouchMove) {
            return false;
        }

        var clientY = event.targetTouches[0].clientY - initialClientY;
        var clientX = event.targetTouches[0].clientX - initialClientX;
        var shouldAllowTouchMove = lock.options.allowTouchMove(el, event, clientY, clientX);

        // If the returned value is a node, check if it can actually be scrolled
        if (shouldAllowTouchMove && typeof shouldAllowTouchMove != 'boolean') {
            var elementToCheck = shouldAllowTouchMove;
            return canScrollThatWay(elementToCheck, clientY);
        }

        return shouldAllowTouchMove;
    });
}

function preventDefault(rawEvent) {
    var e = rawEvent || window.event;

    // For the case whereby consumers adds a touchmove event listener to document.
    // Recall that we do document.addEventListener('touchmove', preventDefault, { passive: false })
    // in disableBodyScroll - so if we provide this opportunity to allowTouchMove, then
    // the touchmove event on document will break.
    if (allowTouchMove(e)) {
        return true;
    }

    // Do not prevent if the event has more than one touch (usually meaning this is a multi touch gesture like pinch to zoom)
    if (e.touches.length > 1) return true;

    if (e.preventDefault) e.preventDefault();

    return false;
}

function setOverflowHidden(options) {
    var _reserveScrollBarGap = options && options.reserveScrollBarGap;
    var scrollBarGap = window.innerWidth - document.documentElement.clientWidth;

    if (_reserveScrollBarGap && scrollBarGap > 0) {

        // If previousBodyPaddingRight is already set, don't set it again.
        if (previousBodyPaddingRight === null) {
            previousBodyPaddingRight = document.body.style.paddingRight;
            document.body.style.paddingRight = scrollBarGap + 'px';
        }

    }

    // If previousBodyOverflowSetting is already set, don't set it again.
    if (previousBodyOverflowSetting === null) {
        previousBodyOverflowSetting = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }

    return scrollBarGap;
}

function restoreOverflowSetting() {

    if (previousBodyPaddingRight !== null) {
        document.body.style.paddingRight = previousBodyPaddingRight;

        // Restore previousBodyPaddingRight to undefined so setOverflowHidden knows it
        // can be set again.
        previousBodyPaddingRight = null;
    }

    if (previousBodyOverflowSetting !== null) {
        document.body.style.overflow = previousBodyOverflowSetting;

        // Restore previousBodyOverflowSetting to undefined
        // so setOverflowHidden knows it can be set again.
        previousBodyOverflowSetting = null;
    }
}

function setElementPaddings(options, scrollBarGap) {

    if (!options || !options.reserveScrollBarGap) {
        return;
    }

    paddableElementSelectors.forEach(function(selector) {

        var element = {
            selector: selector
        };

        if (paddedElements.find(function(otherElement) {
            return otherElement.selector == element.selector;
        })) {
            return;
        }

        var nodes = document.querySelectorAll(element.selector);

        if (nodes.length === 0) {
            return;
        }

        nodes = element.nodes = Array.from(nodes);
        element.previousPaddingRight = [];

        nodes.forEach(function(node) {
            element.previousPaddingRight.push(node.style.paddingRight);
            node.style.paddingRight = scrollBarGap + 'px';
        });


        paddedElements.push(element);
    });
}

function resetElementPaddings() {

    paddedElements.forEach(function(element) {

        if (element.previousPaddingRight !== null) {

            element.nodes.forEach(function(node, i) {
                node.style.paddingRight = element.previousPaddingRight[i];
            });

            element.previousPaddingRight = null;
        }

    });

    paddedElements.length = 0;
}

function addPaddableElements(selectors) {
    paddableElementSelectors = paddableElementSelectors.concat(selectors);
}

function setStyles(options) {
    var scrollBarGap = setOverflowHidden(options);
    setElementPaddings(options, scrollBarGap);
}

function resetStyles() {
    restoreOverflowSetting();
    resetElementPaddings();
}

// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight#Problems_and_solutions
function isTargetElementTotallyScrolled(targetElement) {
    return targetElement ? targetElement.scrollHeight - targetElement.scrollTop <= targetElement.clientHeight : false;
}

function canScrollThatWay(targetElement, clientY) {
    if (targetElement && targetElement.scrollTop === 0 && clientY > 0) {
        // element is at the top of its scroll
        return false;
    }

    if (isTargetElementTotallyScrolled(targetElement) && clientY < 0) {
        // element is at the top of its scroll
        return false;
    }

    return true;
}

function handleScroll(event, targetElement) {
    var clientY = event.targetTouches[0].clientY - initialClientY;

    if (allowTouchMove(event)) {
        return false;
    }

    if (!canScrollThatWay(targetElement, clientY)) {
        return preventDefault(event);
    }

    event.stopPropagation();
    return true;
}

function handleScrollOnSingleTouch(event) {
    if (event.targetTouches.length === 1) {
        // detect single touch
        handleScroll(event, event.currentTarget);
    }
}

function saveClientXY(event) {
    if (event.targetTouches.length === 1) {
        // detect single touch
        initialClientY = event.targetTouches[0].clientY;
        initialClientX = event.targetTouches[0].clientX;
    }
}

function disableBodyScroll(targetElement, options) {

    if (!targetElement) {
        return;
    }

    options = options || {};

    var lock = {
        targetElement: targetElement,
        options: options
    };

    if (!isIosDevice) {
        setStyles(options);
        locks.push(lock);
        return;
    }

    if (!locks.some(function(lock) {
        return lock.targetElement === targetElement;
    })) {
        locks.push(lock);

        targetElement.addEventListener('ontouchmove', handleScrollOnSingleTouch);

        if (!documentListenerAdded) {
            document.addEventListener('touchstart', saveClientXY);
            document.addEventListener('touchmove', preventDefault, hasPassiveEvents ? {passive: false} : undefined);
            documentListenerAdded = true;
        }
    }

}

function enableBodyScroll(targetElement) {

    if (!targetElement) {
        return;
    }

    var lock = locks.find(function(lock) {
        return lock.targetElement == targetElement;
    });

    if (!lock) {
        return;
    }

    locks = locks.filter(function(lock) {
        return lock.targetElement != targetElement;
    });

    if (isIosDevice) {
        targetElement.removeEventListener('ontouchmove', handleScrollOnSingleTouch);

        if (documentListenerAdded && locks.length === 0) {
            document.removeEventListener('touchstart', saveClientXY);
            document.removeEventListener('touchmove', preventDefault);

            documentListenerAdded = false;
        }

    }
    else if (locks.length === 0) {
        resetStyles();
    }
}

function isBodyScrollDisabled(targetElement) {

    if (!targetElement) {
        return locks.length > 0;
    }

    return !!locks.find(function(lock) {
        return lock.targetElement == targetElement;
    });
}

module.exports = {
    lock: disableBodyScroll,
    unlock: enableBodyScroll,
    isLocked: isBodyScrollDisabled,
    addPaddableElements: addPaddableElements
};
