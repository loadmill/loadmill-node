import * as fs from "fs";
import * as path from "path";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');
import * as Loadmill from "./index";

const getAssertionErrors = (testResults) => {
    const resolvedRequests =  testResults.resolvedRequests;
    const testFailures: Loadmill.TestFailures =  testResults.failures;

    const res: any[] = [];

    for (let key in testFailures) {
        if (testFailures.hasOwnProperty(key)) {

            let failedReq = resolvedRequests[key];
            let reqAssertions = failedReq.assert;

            const failures = testFailures[key];
            for (let histoKey in failures.histogram) {
                if (failures.histogram.hasOwnProperty(histoKey)) {
                    let fail = reqAssertions[histoKey];
                    if (fail) { res.push(fail); }
                }
            }

        }
    }
    return res;
};

export const checkAndPrintAssertionErrors = (trialRes) => {
    let assertionErrors = getAssertionErrors(trialRes);
    if (!isEmptyObj(assertionErrors)) {
        console.error('\x1b[31m', 'Test assertions failures -', '\x1b[0m',
            `${JSON.stringify(assertionErrors, null, 4)}`);
    }
};

export const getJSONFilesInFolderRecursively = (fileOrFolder: string, filelist: string[] = []): string[] => {

    let isFile = fs.statSync(fileOrFolder).isFile();

    if (isFile && endsWith(fileOrFolder,'.json')) {
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

    constructor(verbose: boolean){
        this.verb = verbose;
    }

    log = (msg, ...args) => console.log(msg, ...args);
    error = (err) => console.error('\x1b[31m', err, '\x1b[0m');
    verbose = (msg, ...args) => this.verb ? console.log(msg, ...args) : void(0);
}
