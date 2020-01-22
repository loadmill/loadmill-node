"use strict";
exports.__esModule = true;
var tslib_1 = require("tslib");
var Loadmill = require("./index");
var program = require("commander");
var utils_1 = require("./utils");
program
    .usage("<load-config-file-or-folder | testSuiteId> -t <token> [options] [parameter=value...]")
    .description("Run a load test or a test suite on loadmill.com.\n  " +
    "You may set parameter values by passing space-separated 'name=value' pairs, e.g. 'host=www.myapp.com port=80'.\n\n  " +
    "Learn more at https://www.npmjs.com/package/loadmill#cli")
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test.")
    .option("-s, --test-suite", "Launch a test suite. If set then a test suite id must be provided instead of config file.")
    .option("--additional-description <description>", "Add an additional description at the end of the current suite's description - available only for test suites.")
    .option("--labels <labels>", "Add a comma separated string representing an array of labels (e.g. 'label1,label2'), in order to run flows by providing their assigned labels - available only for test suites.")
    .option("-w, --wait", "Wait for the test to finish.")
    .option("-n, --no-bail", "Return exit code 0 even if test fails.")
    .option("-q, --quiet", "Do not print out anything (except errors).")
    .option("-v, --verbose", "Print out extra information for debugging.")
    .option("--colors", "Print test results in color")
    .parse(process.argv);
start()["catch"](function (err) {
    console.error(err);
    process.exit(2);
});
function start() {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var wait, bail, async, quiet, token, verbose, colors, local, loadTest, testSuite, additionalDescription, labels, _a, input, rawParams, logger, parameters, loadmill, res, suite, running, testSuiteRunId, e_1, extInfo, fileOrFolder, listOfFiles, _i, listOfFiles_1, file, res, id, method;
        return tslib_1.__generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("we are here");
                    wait = program.wait, bail = program.bail, async = program.async, quiet = program.quiet, token = program.token, verbose = program.verbose, colors = program.colors, local = program.local, loadTest = program.loadTest, testSuite = program.testSuite, additionalDescription = program.additionalDescription, labels = program.labels, _a = program.args, input = _a[0], rawParams = _a.slice(1);
                    logger = new utils_1.Logger(verbose, colors);
                    if (!token) {
                        validationFailed("No API token provided.");
                    }
                    parameters = toParams(rawParams);
                    if (verbose) {
                        // verbose trumps quiet:
                        quiet = false;
                        logger.log("Inputs:", {
                            input: input,
                            wait: wait,
                            bail: bail,
                            async: async,
                            quiet: quiet,
                            token: token,
                            verbose: verbose,
                            loadTest: loadTest,
                            testSuite: testSuite,
                            additionalDescription: additionalDescription,
                            labels: labels,
                            parameters: parameters
                        });
                    }
                    loadmill = Loadmill({ token: token });
                    if (!testSuite) return [3 /*break*/, 9];
                    if (!utils_1.isUUID(input)) {
                        validationFailed("Test suite run flag is on but no valid test suite id was provided.");
                    }
                    res = void 0;
                    suite = { id: input, additionalDescription: additionalDescription, labels: utils_1.convertStrToArr(labels) };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, loadmill.runTestSuite(suite, parameters)];
                case 2:
                    running = _b.sent();
                    if (!(running && running.id)) return [3 /*break*/, 5];
                    testSuiteRunId = running.id;
                    if (!wait) return [3 /*break*/, 4];
                    logger.verbose("Waiting for test suite:", testSuiteRunId);
                    return [4 /*yield*/, loadmill.wait(running)];
                case 3:
                    res = _b.sent();
                    _b.label = 4;
                case 4:
                    if (!quiet) {
                        logger.log(res ? utils_1.getObjectAsString(res, colors) : testSuiteRunId);
                    }
                    if (res && res.passed != null && !res.passed) {
                        testFailed(logger, "Test suite with id " + input + " failed", bail);
                    }
                    return [3 /*break*/, 6];
                case 5:
                    testFailed(logger, "Couldn't run test suite with id " + input, bail);
                    _b.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    e_1 = _b.sent();
                    if (verbose) {
                        logger.error(e_1);
                    }
                    extInfo = e_1.response && e_1.response.res && e_1.response.res.text;
                    testFailed(logger, "Couldn't run test suite with id " + input + ". " + (extInfo ? extInfo : ''), bail);
                    return [3 /*break*/, 8];
                case 8: return [3 /*break*/, 20];
                case 9:
                    fileOrFolder = input;
                    if (!fileOrFolder) {
                        validationFailed("No configuration file or folder were provided.");
                    }
                    listOfFiles = utils_1.getJSONFilesInFolderRecursively(fileOrFolder);
                    if (listOfFiles.length === 0) {
                        logger.log("No Loadmill test files were found at " + fileOrFolder + " - exiting...");
                    }
                    _i = 0, listOfFiles_1 = listOfFiles;
                    _b.label = 10;
                case 10:
                    if (!(_i < listOfFiles_1.length)) return [3 /*break*/, 20];
                    file = listOfFiles_1[_i];
                    res = void 0, id = void 0;
                    if (!local) return [3 /*break*/, 12];
                    logger.verbose("Running " + file + " as functional test locally");
                    return [4 /*yield*/, loadmill.runFunctionalLocally(file, parameters, undefined, { verbose: verbose, colors: colors })];
                case 11:
                    res = _b.sent();
                    return [3 /*break*/, 16];
                case 12:
                    if (!loadTest) return [3 /*break*/, 14];
                    logger.verbose("Launching " + file + " as load test");
                    return [4 /*yield*/, loadmill.run(file, parameters)];
                case 13:
                    id = _b.sent();
                    return [3 /*break*/, 16];
                case 14:
                    logger.verbose("Running " + file + " as functional test");
                    method = async ? 'runAsyncFunctional' : 'runFunctional';
                    return [4 /*yield*/, loadmill[method](file, parameters)];
                case 15:
                    res = _b.sent();
                    _b.label = 16;
                case 16:
                    if (!(wait && (loadTest || async))) return [3 /*break*/, 18];
                    logger.verbose("Waiting for test:", res ? res.id : id);
                    return [4 /*yield*/, loadmill.wait(res || id)];
                case 17:
                    res = _b.sent();
                    _b.label = 18;
                case 18:
                    if (!quiet) {
                        logger.log(JSON.stringify(res, null, 4) || id);
                    }
                    if (res && res.passed != null && !res.passed) {
                        logger.error("\u274C  Test " + file + " failed.");
                        if (bail) {
                            process.exit(1);
                        }
                    }
                    _b.label = 19;
                case 19:
                    _i++;
                    return [3 /*break*/, 10];
                case 20: return [2 /*return*/];
            }
        });
    });
}
function validationFailed() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.log('');
    console.error.apply(console, args);
    program.outputHelp();
    process.exit(3);
}
function toParams(rawParams) {
    var parameters = {};
    rawParams.forEach(function (pair) {
        var pivot = pair.indexOf('=');
        if (pivot <= 0) {
            validationFailed("Invalid parameter assignment:", pair);
        }
        var name = pair.slice(0, pivot);
        parameters[name] = pair.slice(pivot + 1, pair.length);
    });
    return parameters;
}
function testFailed(logger, msg, bail) {
    logger.error("\u274C " + msg + ".");
    if (bail) {
        process.exit(1);
    }
}
