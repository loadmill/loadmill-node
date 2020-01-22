"use strict";
exports.__esModule = true;
var fs = require("fs");
var path = require("path");
var isEmpty = require("lodash/isEmpty");
var isAString = require("lodash/isString");
var findLast = require("lodash/findLast");
var loadmill_runner_1 = require("loadmill-runner");
var util = require("util");
var getAssertionErrors = function (testResults) {
    var resolvedRequests = testResults.resolvedRequests;
    var testFailures = testResults.failures;
    var failuresPerRequest = {};
    for (var key in testFailures) {
        if (testFailures.hasOwnProperty(key)) {
            failuresPerRequest[key] = [];
            var failedReq = resolvedRequests[key];
            var reqAssertions = failedReq.assert;
            var failures = testFailures[key];
            for (var histoKey in failures.histogram) {
                if (failures.histogram.hasOwnProperty(histoKey)) {
                    var fail = reqAssertions[histoKey];
                    if (fail) {
                        failuresPerRequest[key].push(fail);
                    }
                }
            }
        }
    }
    return failuresPerRequest;
};
exports.getObjectAsString = function (obj, colors) {
    // trim response body to length of 255
    if (obj.response && obj.response.text && obj.response.text.length > 1024) {
        obj.response.text = obj.response.text.substring(0, 1024) + ' [trimmed]';
    }
    return util.inspect(obj, { showHidden: false, depth: null, colors: colors, compact: false });
};
exports.convertStrToArr = function (strWithCommas) {
    return typeof strWithCommas !== "string" ? null : strWithCommas.split(",");
};
var printRequest = function (trialRes, assertionErrorsPerRequest, testArgs, logger) {
    if (testArgs && testArgs.verbose) {
        logger.error('Test failure response -');
        logger.log(exports.getObjectAsString(trialRes, testArgs.colors));
    }
    else {
        logger.error('Test failed request -');
        for (var requestIndex in assertionErrorsPerRequest) {
            logger.log(exports.getObjectAsString(trialRes.resolvedRequests[requestIndex], testArgs && testArgs.colors));
        }
    }
};
var evaluteParameterExpresion = function (expr, postParams) { return loadmill_runner_1.resolveExpression(expr, postParams); };
exports.checkAndPrintErrors = function (trialRes, testArgs, logger, description) {
    var assertionErrorsPerRequest = getAssertionErrors(trialRes);
    if (!exports.isEmptyObj(assertionErrorsPerRequest)) {
        logger.error('Test failed - ' + description);
        for (var requestIndex in assertionErrorsPerRequest) {
            var request = trialRes.resolvedRequests[requestIndex];
            var description_1 = request.description || requestIndex;
            if (assertionErrorsPerRequest[requestIndex].length == 0) {
                // If there was a failure but no assertion failed this means the request itself failed
                logger.log("Failed request \"" + description_1 + "\" - " + request.method + " " + request.url);
                if (request.response) {
                    logger.log("Status: " + request.response.status + " " + request.response.statusText);
                }
                var histogram = trialRes.failures[requestIndex].histogram;
                for (var errorKey in histogram) {
                    logger.log("Error: " + errorKey);
                }
            }
            else {
                logger.error("Assertion errors in request \"" + description_1 + "\" - " + request.method + " " + request.url);
            }
            for (var _i = 0, _a = assertionErrorsPerRequest[requestIndex]; _i < _a.length; _i++) {
                var error = _a[_i];
                var parameterName = error.check;
                var actualParameter = findLast(request.postParameters, parameterName); // can stay undefined in case the param is undefined
                var actualParameterValue = actualParameter ? actualParameter[parameterName] : undefined;
                // to do, eval the assertion expression to the actual string
                var assertionMismatch = "be not empty or true";
                if (error.equals) {
                    assertionMismatch = "be \"" + evaluteParameterExpresion(error.equals, request.postParameters) + "\"";
                }
                else if (error.contains) {
                    assertionMismatch = "contain \"" + evaluteParameterExpresion(error.contains, request.postParameters) + "\"";
                }
                else if (error.matches) {
                    assertionMismatch = "match \"" + evaluteParameterExpresion(error.matches, request.postParameters) + "\"";
                }
                logger.log("\u274C  Paramter \"" + parameterName + "\" value is \"" + actualParameterValue + "\", expected to", assertionMismatch);
            }
        }
    }
    logger.log('\n');
    printRequest(trialRes, assertionErrorsPerRequest, testArgs, logger);
    logger.log('\n');
};
exports.getJSONFilesInFolderRecursively = function (fileOrFolder, filelist) {
    if (filelist === void 0) { filelist = []; }
    var isFile = fs.statSync(fileOrFolder).isFile();
    if (isFile && endsWith(fileOrFolder, '.json')) {
        filelist.push(fileOrFolder);
    }
    else if (!isFile) {
        fs.readdirSync(fileOrFolder)
            .map(function (file) {
            return exports.getJSONFilesInFolderRecursively(path.join(fileOrFolder, file), filelist);
        });
    }
    return filelist;
};
var endsWith = function (str, suffix) { return str.indexOf(suffix, str.length - suffix.length) !== -1; };
exports.isEmptyObj = function (obj) { return isEmpty(obj); };
exports.isString = function (obj) { return isAString(obj); };
exports.isUUID = function (s) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
};
var Logger = /** @class */ (function () {
    function Logger(verbose, colors) {
        var _this = this;
        this.verb = false;
        this.colors = false;
        this.log = function (msg) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            return console.log.apply(console, [msg].concat(args));
        };
        this.error = function (err) {
            if (_this.colors) {
                console.log('\x1b[31m', err, '\x1b[0m');
            }
            else {
                console.log(err);
            }
        };
        this.verbose = function (msg) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            return _this.verb ? console.log.apply(console, [msg].concat(args)) : void (0);
        };
        this.verb = verbose;
        this.colors = colors;
    }
    return Logger;
}());
exports.Logger = Logger;
