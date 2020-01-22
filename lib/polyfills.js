"use strict";
exports.__esModule = true;
var tslib = require("tslib");
if (global) {
    global['__importDefault'] = tslib.__importDefault;
}
var BluebirdPromise = require("bluebird");
var cancelable_awaiter_1 = require("cancelable-awaiter");
BluebirdPromise.config({
    cancellation: true,
    longStackTraces: false
});
if (global) {
    global.Promise = BluebirdPromise;
    global.Bluebird = BluebirdPromise;
    tslib.__assign(global, tslib, { __awaiter: cancelable_awaiter_1["default"] });
}
