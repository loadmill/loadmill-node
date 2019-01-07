
const tslib = require("tslib");

if (global) {
    global['__importDefault'] = tslib.__importDefault;
}

import * as BluebirdPromise from "bluebird";
import awaiter from "cancelable-awaiter";

BluebirdPromise.config({
    cancellation: true,
    longStackTraces: false,
});

if (global) {
    global.Promise = BluebirdPromise;
    global.Bluebird = BluebirdPromise;
    tslib.__assign(global, tslib, {__awaiter: awaiter});
}

declare global {
    const Bluebird: typeof BluebirdPromise;

    interface Bluebird<T = any> extends BluebirdPromise<T> {}
}
