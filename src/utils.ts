import * as fs from "fs";
import * as path from "path";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');
import * as Loadmill from "./index";

const getAssertionErrors = (testResults) => {
    const resolvedRequests = testResults.resolvedRequests;
    const testFailures: Loadmill.TestFailures = testResults.failures;

    const failuresPerRequest = {};

    for (let key in testFailures) {
        if (testFailures.hasOwnProperty(key)) {

            failuresPerRequest[key] = [];

            let failedReq = resolvedRequests[key];
            let reqAssertions = failedReq.assert;

            const failures = testFailures[key];
            for (let histoKey in failures.histogram) {
                if (failures.histogram.hasOwnProperty(histoKey)) {
                    let fail = reqAssertions[histoKey];
                    if (fail) { failuresPerRequest[key].push(fail); }
                }
            }

        }
    }
    return failuresPerRequest;
};

export const checkAndPrintAssertionErrors = (trialRes) => {
    let assertionErrorsPerRequest = getAssertionErrors(trialRes);
    if (!isEmptyObj(assertionErrorsPerRequest)) {
        console.error('\x1b[31m', 'Test failures -', '\x1b[0m');

        for (let requestIndex in assertionErrorsPerRequest) {
            let request = trialRes.resolvedRequests[requestIndex];
            let description = request.description || requestIndex;

            if (assertionErrorsPerRequest[requestIndex].length == 0) {
                // If there was a failure but no assertion failed this means the request itself failed
                console.log(`Failed request "${description}" - ${request.method} ${request.url}`);
                if (request.response) {
                    console.log(`Status: ${request.response.status} ${request.response.statusText}`);
                }

                let histogram = trialRes.failures[requestIndex].histogram;
                for (let errorKey in histogram) {
                    console.log(`Error: ${errorKey}`);
                }

            } else {
                console.log(`Assertion errors in request "${description}" - ${request.method} ${request.url}`);
            }

            for (let error of assertionErrorsPerRequest[requestIndex]) {
                const parameter = error.check;

                let actualParameterValue; // can stay undefined in case the param is undefined
                for (let paramWrapper of request.postParameters) {
                    actualParameterValue = paramWrapper[parameter];
                }

                // to do, eval the assertion expression to the actual string
                let assertionMismatch = "be not empty or true"
                if (error.equals) {
                    assertionMismatch = `be "${error.equals}"`
                } else if (error.contains) {
                    assertionMismatch = `contain "${error.contains}"`
                } else if (error.matches) {
                    assertionMismatch = `match "${error.matches}"`
                }

                console.log(`Paramter "${parameter}" value is "${actualParameterValue}", expected to`, assertionMismatch);
            }
        }

    }
};

export const getJSONFilesInFolderRecursively = (fileOrFolder: string, filelist: string[] = []): string[] => {

    let isFile = fs.statSync(fileOrFolder).isFile();

    if (isFile && endsWith(fileOrFolder, '.json')) {
        filelist.push(fileOrFolder);
    } else if (!isFile) {
        fs.readdirSync(fileOrFolder)
            .map(file =>
                getJSONFilesInFolderRecursively(path.join(fileOrFolder, file), filelist));
    }

    return filelist;
};

const endsWith = (str, suffix) => str.indexOf(suffix, str.length - suffix.length) !== -1;

export const isEmptyObj = (obj) => isEmpty(obj);
export const isString = (obj) => isAString(obj);

export class Logger {
    private readonly verb: boolean = false;

    constructor(verbose: boolean) {
        this.verb = verbose;
    }

    log = (msg, ...args) => console.log(msg, ...args);
    error = (err) => console.error('\x1b[31m', err, '\x1b[0m');
    verbose = (msg, ...args) => this.verb ? console.log(msg, ...args) : void (0);
}
