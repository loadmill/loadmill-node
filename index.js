"use strict";
var tslib_1 = require("tslib");
var fs = require("fs");
var superagent = require("superagent");
var LoadmillClient = (function () {
    function LoadmillClient(token) {
        var _this = this;
        this.token = token;
        this.run = function (config, paramsOrCallback) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var testId;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = toConfig(config, paramsOrCallback);
                        return [4 /*yield*/, this._auth(superagent.post("https://www.loadmill.com/api/tests")
                                .send(config))];
                    case 1:
                        testId = (_a.sent()).body.testId;
                        return [4 /*yield*/, this._auth(superagent.put("https://www.loadmill.com/api/tests/" + testId + "/load"))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, testId];
                }
            });
        }); };
        this.runFunctional = function (config, paramsOrCallback) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var _a, id, trialResult, incompleteMessage;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        config = toConfig(config, paramsOrCallback);
                        return [4 /*yield*/, this._auth(superagent.post("https://www.loadmill.com/api/tests/trials")
                                .send(config))];
                    case 1:
                        _a = (_b.sent()).body, id = _a.id, trialResult = _a.trialResult, incompleteMessage = _a.incompleteMessage;
                        if (incompleteMessage) {
                            throw Error(incompleteMessage);
                        }
                        else {
                            return [2 /*return*/, {
                                    id: id,
                                    url: "https://www.loadmill.com/app/functional/" + id,
                                    passed: trialResult && Object.keys(trialResult.failures || {}).length === 0
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        }); };
        this._auth = function (req) { return req.auth(_this.token, ''); };
    }
    return LoadmillClient;
}());
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
module.exports = function (_a) {
    var token = _a.token;
    return new LoadmillClient(token);
};
