"use strict";
var tslib_1 = require("tslib");
require("./polyfills");
var fs = require("fs");
var superagent = require("superagent");
var utils_1 = require("./utils");
var loadmill_runner_1 = require("loadmill-runner");
function Loadmill(options) {
    var _a = options, token = _a.token, _b = _a._testingServerHost, _testingServerHost = _b === void 0 ? process.env.LOADMILL_SERVER_HOST || "www.loadmill.com" : _b;
    var testingServer = "https://" + _testingServerHost;
    function _runFolderSync(listOfFiles, execFunc) {
        var funcArgs = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            funcArgs[_i - 2] = arguments[_i];
        }
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var results, _a, listOfFiles_1, file, res, testResult;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        results = [];
                        _a = 0, listOfFiles_1 = listOfFiles;
                        _b.label = 1;
                    case 1:
                        if (!(_a < listOfFiles_1.length)) return [3 /*break*/, 7];
                        file = listOfFiles_1[_a];
                        return [4 /*yield*/, execFunc.apply(void 0, [file].concat(funcArgs))];
                    case 2:
                        res = _b.sent();
                        testResult = void 0;
                        if (!(!utils_1.isString(res) && !res.id)) return [3 /*break*/, 3];
                        testResult = { url: Loadmill.TYPES.LOCAL, passed: res.passed };
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, _wait(res)];
                    case 4:
                        testResult = _b.sent();
                        _b.label = 5;
                    case 5:
                        results.push(testResult);
                        if (!testResult.passed)
                            return [3 /*break*/, 7];
                        _b.label = 6;
                    case 6:
                        _a++;
                        return [3 /*break*/, 1];
                    case 7: return [2 /*return*/, results];
                }
            });
        });
    }
    function _wait(testDefOrId, callback) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            var resolve, reject, testDef, apiUrl, webUrl, intervalId;
            return tslib_1.__generator(this, function (_a) {
                testDef = typeof testDefOrId === 'string' ? {
                    id: testDefOrId,
                    type: Loadmill.TYPES.LOAD
                } : testDefOrId;
                apiUrl = getTestAPIUrl(testDef, testingServer);
                webUrl = getTestWebUrl(testDef, testingServer);
                intervalId = setInterval(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    var body, testResult, err_1;
                    return tslib_1.__generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, superagent.get(apiUrl)
                                        .auth(token, '')];
                            case 1:
                                body = (_a.sent()).body;
                                if (isTestInFinalState(body)) {
                                    clearInterval(intervalId);
                                    testResult = tslib_1.__assign({}, testDef, { url: webUrl, passed: isTestPassed(body, testDef.type) });
                                    if (callback) {
                                        callback(null, testResult);
                                    }
                                    else {
                                        resolve(testResult);
                                    }
                                }
                                return [3 /*break*/, 3];
                            case 2:
                                err_1 = _a.sent();
                                if (testDef.type === Loadmill.TYPES.FUNCTIONAL && err_1.status === 404) {
                                    // 404 for functional could be fine when async - keep going:
                                    return [2 /*return*/];
                                }
                                clearInterval(intervalId);
                                if (callback) {
                                    callback(err_1, null);
                                }
                                else {
                                    reject(err_1);
                                }
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); }, 10 * 1000);
                return [2 /*return*/, callback ? null : new Promise(function (_resolve, _reject) {
                        resolve = _resolve;
                        reject = _reject;
                    })];
            });
        });
    }
    function _runFunctionalLocally(config, paramsOrCallback, callback, testArgs) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, wrap(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var verbose, colors, logger, description, trialRes;
                        return tslib_1.__generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    verbose = testArgs && testArgs.verbose ? testArgs.verbose : false;
                                    colors = testArgs && testArgs.colors ? testArgs.colors : false;
                                    logger = new utils_1.Logger(verbose, colors);
                                    description = (config.meta && config.meta.description) || 'no-test-description';
                                    config = toConfig(config, paramsOrCallback);
                                    config['async'] = false;
                                    return [4 /*yield*/, loadmill_runner_1.runFunctionalOnLocalhost(config)];
                                case 1:
                                    trialRes = _a.sent();
                                    if (!utils_1.isEmptyObj(trialRes.failures)) {
                                        utils_1.checkAndPrintErrors(trialRes, testArgs, logger, description);
                                    }
                                    return [2 /*return*/, {
                                            type: Loadmill.TYPES.FUNCTIONAL,
                                            passed: isFunctionalPassed(trialRes),
                                            description: description
                                        }];
                            }
                        });
                    }); }, callback || paramsOrCallback)];
            });
        });
    }
    function _runFunctional(config, async, paramsOrCallback, callback) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, wrap(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var description, _a, id, trialResult, incompleteMessage;
                        return tslib_1.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    description = (config.meta && config.meta.description) || 'no-test-description';
                                    config = toConfig(config, paramsOrCallback);
                                    config['async'] = async;
                                    return [4 /*yield*/, superagent.post(testingServer + "/api/tests/trials")
                                            .send(config)
                                            .auth(token, '')];
                                case 1:
                                    _a = (_b.sent()).body, id = _a.id, trialResult = _a.trialResult, incompleteMessage = _a.incompleteMessage;
                                    if (incompleteMessage) {
                                        throw Error(incompleteMessage);
                                    }
                                    else {
                                        return [2 /*return*/, {
                                                id: id,
                                                type: Loadmill.TYPES.FUNCTIONAL,
                                                url: testingServer + "/app/functional/" + id,
                                                passed: async ? null : isFunctionalPassed(trialResult),
                                                description: description
                                            }];
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); }, callback || paramsOrCallback)];
            });
        });
    }
    function _runTestSuite(suite, paramsOrCallback, callback) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _this = this;
            var overrideParameters, suiteId, additionalDescription, labels;
            return tslib_1.__generator(this, function (_a) {
                overrideParameters = typeof paramsOrCallback !== 'function' ? paramsOrCallback : {};
                if (typeof suite === 'string') {
                    suiteId = suite;
                }
                else {
                    suiteId = suite.id;
                    additionalDescription = suite.additionalDescription;
                    labels = suite.labels;
                }
                return [2 /*return*/, wrap(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var _a, testSuiteRunId, err;
                        return tslib_1.__generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, superagent.post(testingServer + "/api/test-suites/" + suiteId + "/run")
                                        .send({ overrideParameters: overrideParameters, additionalDescription: additionalDescription, labels: labels })
                                        .auth(token, '')];
                                case 1:
                                    _a = (_b.sent()).body, testSuiteRunId = _a.testSuiteRunId, err = _a.err;
                                    if (err || !testSuiteRunId) {
                                        console.error(err ? JSON.stringify(err) : "The server encountered an error while handling the request");
                                        return [2 /*return*/];
                                    }
                                    return [2 /*return*/, { id: testSuiteRunId, type: Loadmill.TYPES.SUITE }];
                            }
                        });
                    }); }, callback || paramsOrCallback)];
            });
        });
    }
    return {
        run: function (config, paramsOrCallback, callback) {
            var _this = this;
            return wrap(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                var testId;
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            config = toConfig(config, paramsOrCallback);
                            return [4 /*yield*/, superagent.post(testingServer + "/api/tests")
                                    .send(config)
                                    .auth(token, '')];
                        case 1:
                            testId = (_a.sent()).body.testId;
                            return [4 /*yield*/, superagent.put(testingServer + "/api/tests/" + testId + "/load")
                                    .auth(token, '')];
                        case 2:
                            _a.sent();
                            return [2 /*return*/, testId];
                    }
                });
            }); }, callback || paramsOrCallback);
        },
        runFolder: function (folderPath, paramsOrCallback, callback) {
            return tslib_1.__awaiter(this, void 0, void 0, function () {
                var listOfFiles;
                return tslib_1.__generator(this, function (_a) {
                    listOfFiles = utils_1.getJSONFilesInFolderRecursively(folderPath);
                    if (listOfFiles.length === 0) {
                        console.log("No Loadmill test files were found at " + folderPath + " - exiting...");
                    }
                    return [2 /*return*/, _runFolderSync(listOfFiles, this.run, paramsOrCallback, callback)];
                });
            });
        },
        wait: function (testDefOrId, callback) {
            return _wait(testDefOrId, callback);
        },
        runFunctional: function (config, paramsOrCallback, callback) {
            return _runFunctional(config, false, paramsOrCallback, callback);
        },
        runFunctionalFolder: function (folderPath, paramsOrCallback, callback) {
            return tslib_1.__awaiter(this, void 0, void 0, function () {
                var listOfFiles;
                return tslib_1.__generator(this, function (_a) {
                    listOfFiles = utils_1.getJSONFilesInFolderRecursively(folderPath);
                    if (listOfFiles.length === 0) {
                        console.log("No Loadmill test files were found at " + folderPath + " - exiting...");
                    }
                    return [2 /*return*/, _runFolderSync(listOfFiles, _runFunctional, false, paramsOrCallback, callback)];
                });
            });
        },
        runFunctionalLocally: function (config, paramsOrCallback, callback, testArgs) {
            return tslib_1.__awaiter(this, void 0, void 0, function () {
                return tslib_1.__generator(this, function (_a) {
                    return [2 /*return*/, _runFunctionalLocally(config, paramsOrCallback, callback, testArgs)];
                });
            });
        },
        runFunctionalFolderLocally: function (folderPath, paramsOrCallback, callback) {
            return tslib_1.__awaiter(this, void 0, void 0, function () {
                var listOfFiles;
                return tslib_1.__generator(this, function (_a) {
                    listOfFiles = utils_1.getJSONFilesInFolderRecursively(folderPath);
                    if (listOfFiles.length === 0) {
                        console.log("No Loadmill test files were found at " + folderPath + " - exiting...");
                    }
                    return [2 /*return*/, _runFolderSync(listOfFiles, _runFunctionalLocally, paramsOrCallback, callback)];
                });
            });
        },
        runAsyncFunctional: function (config, paramsOrCallback, callback) {
            return _runFunctional(config, true, paramsOrCallback, callback);
        },
        runTestSuite: function (suite, paramsOrCallback, callback) {
            return _runTestSuite(suite, paramsOrCallback, callback);
        }
    };
}
function isFunctionalPassed(trialResult) {
    return !!trialResult && Object.keys(trialResult.failures || {}).length === 0;
}
var isTestPassed = function (body, type) {
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return isFunctionalPassed(body.trialResult);
        case Loadmill.TYPES.SUITE:
            return body.status === "PASSED";
        default://load
            return body.result === 'done';
    }
};
function isTestInFinalState(body) {
    var trialResult = body.trialResult, result = body.result, status = body.status;
    return ((result || trialResult === false) || // load or functional tests
        (status && status !== "RUNNING") // test suites
    );
}
function getTestAPIUrl(_a, server) {
    var id = _a.id, type = _a.type;
    var prefix = server + "/api";
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return prefix + "/tests/trials/" + id;
        case Loadmill.TYPES.SUITE:
            return prefix + "/test-suites-runs/" + id;
        default://load
            return prefix + "/tests/" + id;
    }
}
function getTestWebUrl(_a, server) {
    var id = _a.id, type = _a.type;
    var prefix = server + "/app";
    switch (type) {
        case Loadmill.TYPES.FUNCTIONAL:
            return prefix + "/functional/" + id;
        case Loadmill.TYPES.SUITE:
            return prefix + "/api-tests/test-suite-runs/" + id;
        default://load
            return prefix + "/test/" + id;
    }
}
function wrap(asyncFunction, paramsOrCallback) {
    var promise = asyncFunction();
    if (typeof paramsOrCallback === 'function') {
        promise.then(function (res) { return paramsOrCallback(null, res); })["catch"](function (err) { return paramsOrCallback(err, null); });
    }
    else {
        return promise;
    }
}
function toConfig(config, paramsOrCallback) {
    if (typeof config === 'string') {
        var text = fs.readFileSync(config).toString();
        config = JSON.parse(text);
    }
    if (typeof paramsOrCallback === 'object' && paramsOrCallback != null) {
        var parameters = config.parameters;
        if (!parameters) {
            config.parameters = paramsOrCallback;
        }
        else if (typeof parameters.push === 'function') {
            parameters.push(paramsOrCallback);
        }
        else {
            config.parameters = [parameters, paramsOrCallback];
        }
    }
    return config;
}
(function (Loadmill) {
    var TYPES;
    (function (TYPES) {
        TYPES["LOAD"] = "load";
        TYPES["FUNCTIONAL"] = "functional";
        TYPES["SUITE"] = "test-suite";
        TYPES["LOCAL"] = "local";
    })(TYPES = Loadmill.TYPES || (Loadmill.TYPES = {}));
    ;
})(Loadmill || (Loadmill = {}));
module.exports = Loadmill;
