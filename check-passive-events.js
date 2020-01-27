module.exports = function checkPassiveEvents() {
    var hasPassiveEvents = false;

    var passiveTestOptions = {};

    Object.defineProperty(passiveTestOptions, 'passive', {
        get: function() {
            hasPassiveEvents = true;
            return undefined;
        }
    });

    window.addEventListener('testPassive', null, passiveTestOptions);
    window.removeEventListener('testPassive', null);

    return hasPassiveEvents;
};
