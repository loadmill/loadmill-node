import * as fs from "fs";
import * as path from "path";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');
import findLast = require('lodash/findLast');
import * as Loadmill from "./index";
import { resolveExpression } from 'loadmill-runner';
import * as util from 'util';


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

export const getObjectAsString = (obj, colors) => {
    // trim response body to length of 255
    if (obj.response && obj.response.text && obj.response.text.length > 1024) {
        obj.response.text = obj.response.text.substring(0, 1024) + ' [trimmed]'
    }
    return util.inspect(obj, { showHidden: false, depth: null, colors: colors, compact: false } as any);
}

const coloredFlowLine = (status, colors) => {
    if (!colors) {
        return status;
    }
    return `${getStatusColor(status)}${status}${CLI_COLORS.DEFAULT}`;
}

export const printFlowRunsReport = (testSuiteFlowRuns, logger, colors) => {
    if (testSuiteFlowRuns) {
        logger.log("Test Suite Flow Runs report:");
        testSuiteFlowRuns.map(
            f => logger.log(`Flow ${f.description} - ${coloredFlowLine(f.status, colors)}`));
    }
}

export const convertStrToArr = (strWithCommas) => {
    return typeof strWithCommas !== "string" ? null : strWithCommas.split(",");
}

const printRequest = (trialRes, assertionErrorsPerRequest, testArgs, logger) => {
    if (testArgs && testArgs.verbose) {
        logger.error('Test failure response -');
        logger.log(getObjectAsString(trialRes, testArgs.colors));
    } else {
        logger.error('Test failed request -');
        for (let requestIndex in assertionErrorsPerRequest) {
            logger.log(getObjectAsString(trialRes.resolvedRequests[requestIndex], testArgs && testArgs.colors));
        }
    }
}

const evaluteParameterExpresion = (expr, postParams) => resolveExpression(expr, postParams);

export const checkAndPrintErrors = (trialRes, testArgs, logger, description) => {
    let assertionErrorsPerRequest = getAssertionErrors(trialRes);

    if (!isEmptyObj(assertionErrorsPerRequest)) {
        logger.error('Test failed - ' + description);

        for (let requestIndex in assertionErrorsPerRequest) {
            let request = trialRes.resolvedRequests[requestIndex];
            let description = request.description || requestIndex;

            if (assertionErrorsPerRequest[requestIndex].length == 0) {
                // If there was a failure but no assertion failed this means the request itself failed
                logger.log(`Failed request "${description}" - ${request.method} ${request.url}`);
                if (request.response) {
                    logger.log(`Status: ${request.response.status} ${request.response.statusText}`);
                }

                let histogram = trialRes.failures[requestIndex].histogram;
                for (let errorKey in histogram) {
                    logger.log(`Error: ${errorKey}`);
                }

            } else {
                logger.error(`Assertion errors in request "${description}" - ${request.method} ${request.url}`);
            }

            for (let error of assertionErrorsPerRequest[requestIndex]) {
                const parameterName = error.check;

                const actualParameter = findLast(request.postParameters, parameterName); // can stay undefined in case the param is undefined
                const actualParameterValue = actualParameter ? actualParameter[parameterName] : undefined;

                // to do, eval the assertion expression to the actual string
                let assertionMismatch = "be not empty or true"
                if (error.equals) {
                    assertionMismatch = `be "${evaluteParameterExpresion(error.equals, request.postParameters)}"`
                } else if (error.contains) {
                    assertionMismatch = `contain "${evaluteParameterExpresion(error.contains, request.postParameters)}"`
                } else if (error.matches) {
                    assertionMismatch = `match "${evaluteParameterExpresion(error.matches, request.postParameters)}"`
                }

                logger.log(`❌  Paramter "${parameterName}" value is "${actualParameterValue}", expected to`, assertionMismatch);
            }
        }

    }

    logger.log('\n');
    printRequest(trialRes, assertionErrorsPerRequest, testArgs, logger);
    logger.log('\n');
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
export const isUUID = s =>
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);

export class Logger {
    private readonly verb: boolean = false;
    private readonly colors: boolean = false;

    constructor(verbose: boolean, colors: boolean) {
        this.verb = verbose;
        this.colors = colors;
    }

    log = (msg, ...args) => console.log(msg, ...args);
    error = (err) => {
        if (this.colors) {
            console.log(CLI_COLORS.RED, err, CLI_COLORS.DEFAULT);
        } else {
            console.log(err);
        }
    };
    warn = (wrn) => {
        if (this.colors) {
            console.log(CLI_COLORS.YELLOW, wrn, CLI_COLORS.DEFAULT);
        } else {
            console.log(wrn);
        }
    };
    verbose = (msg, ...args) => this.verb ? console.log(msg, ...args) : void (0);
}

const getStatusColor = (status) => {
    switch (status) {
        case "PASSED":
            return CLI_COLORS.GREEN;
        case "FAILED":
            return CLI_COLORS.RED;
        case "STOPPED":
            return CLI_COLORS.GREY;
        default:
            return CLI_COLORS.DEFAULT;
    }
}

const CLI_COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    GREY: '\x1b[90m',
    DEFAULT: '\x1b[0m'
}