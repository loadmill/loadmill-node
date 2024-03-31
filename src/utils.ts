import * as fs from "fs";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');
import * as util from 'util';

const CLI_COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    GREY: '\x1b[90m',
    DEFAULT: '\x1b[0m'
}

const STATUSES = {
    PASSED: "PASSED",
    FAILED: "FAILED",
    STOPPED: "STOPPED",
    FLAKY: "FLAKY",
};

const HALF_TAB = "  ";

function failedFlowLine(f: any, colors: any): string {
    return `${HALF_TAB}${HALF_TAB}Flow ${f.description} - ${coloredFlowLine(f.status, colors)}`;
}
const FAILED_STATUS_LINE = `status: '${CLI_COLORS.RED}FAILED${CLI_COLORS.DEFAULT}'`;
const PASSED_STATUS_LINE = `status: '${CLI_COLORS.GREEN}PASSED${CLI_COLORS.DEFAULT}'`;

export const getObjectAsString = (obj, colors) => {
    // trim response body to length of 255
    if (obj.response && obj.response.text && obj.response.text.length > 1024) {
        obj.response.text = obj.response.text.substring(0, 1024) + ' [trimmed]'
    }
    
    let str = util.inspect(obj, { showHidden: false, depth: null, compact: false } as any);
    if (colors) {
        str = str
        .replace(/status:\s*'FAILED'/g, FAILED_STATUS_LINE)
        .replace(/status:\s*'PASSED'/g, PASSED_STATUS_LINE);
    } 
    return str;
}

const coloredFlowLine = (status, colors) => {
    if (!colors) {
        return status;
    }
    return `${getStatusColor(status)}${status}${CLI_COLORS.DEFAULT}`;
}

export const printOnlyFailedFlowRunsReport = (testSuitesRuns, logger, colors) => {
    if (Array.isArray(testSuitesRuns) && testSuitesRuns.length > 0) {
        let total = 0;
        let totalFailed = 0;
        let lines: Array<string> =[]
        testSuitesRuns.forEach(suiteRun => {
            const { flowRuns } = suiteRun;
            if (flowRuns && Array.isArray(flowRuns)) {
                total += flowRuns.length;
                const suiteLines: Array<string> =[]
                flowRuns.forEach((f) => {
                    if (f.status === STATUSES.FAILED) {
                        suiteLines.push(failedFlowLine(f, colors))
                    }
                });
                if (suiteLines.length > 0) {
                    lines.push("");
                    lines.push(`${HALF_TAB}Test Suite ${suiteRun.description} has failed flow:`);
                    lines = lines.concat(suiteLines);
                    lines.push(`${HALF_TAB}More info can be found at ${suiteRun.url}`);
                    totalFailed += suiteLines.length;
                }
            }
        });
        if (lines.length >0) {
            logger.log("");
            logger.log(`Test Plan errors report - ${CLI_COLORS.RED}${totalFailed} flows have failed ${CLI_COLORS.DEFAULT} (out of ${total} total).`)
            lines.forEach(l=> logger.log(l));
        }
}
}

export const printTestSuitesRunsReport = (testPlanDescription, testSuitesRuns, logger, colors) => {
    if (Array.isArray(testSuitesRuns) && testSuitesRuns.length > 0) {
        logger.log("");
        logger.log(`Test Plan [${testPlanDescription}] Suites Runs report:`);
        testSuitesRuns.map(
            ts => logger.log(`Test Suite ${ts.description} - ${coloredFlowLine(ts.status, colors)}`));
    }
}

export const convertStrToArr = (strWithCommas) => {
    return typeof strWithCommas !== "string" ? null : strWithCommas.split(",");
}

export const convertArrToLabelQueryParams = (arr: Array<string | number>): string => {
    return '&label=' + arr.join('&label=');
}

export const filterLabels = (labels: Array<number | string>) => {
    if (!Array.isArray(labels)) {
        throw new Error(`lables need be in array format i.e. ['my label', 'another label']. Got ${labels}`);
    }
    if (labels.every(l => l == '')) {
        return null;
    }
    return labels.filter(l => (typeof l === 'string' || typeof l === 'number') && l !== '');
}

export const filterTags = (tags: Array<string>) => {
    if (!Array.isArray(tags)) {
        throw new Error(`Tags need be in array format i.e. ['tag1', 'another tag']. Got ${tags}`);
    }
    if (tags.every(l => l == '')) {
        return null;
    }
    return tags.filter(l => (typeof l === 'string') && l !== '');
}

export const isEmptyObj = (obj) => isEmpty(obj);
export const isString = (obj) => isAString(obj);
export const isUUID = s =>
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);

export const toLoadmillParams = (rawParams: string[]) => {
    const parameters = {};

    rawParams.forEach(pair => {
        if (!pair) {
            return; 
        }
        
        const pivot = pair.indexOf('=');

        if (pivot <= 0) {
            throw new Error(`Invalid parameter assignment: ${pair}`);
        }

        const name = pair.slice(0, pivot);
        parameters[name] = pair.slice(pivot + 1, pair.length);
    });

    return parameters;
}

export const readRawParams = (filePath: string): string[] => {
    try {
        return fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    } catch (err) {
        throw new Error(`Couldn't find file '${filePath}'. Please check file path and permissions.`);
    }
};

export const sleep = async (ms: number) => {
    await new Promise(r => setTimeout(r, ms));
};

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

export const getLogger = (testArgs) => {
    const verbose = testArgs && testArgs.verbose ? testArgs.verbose : false;
    const colors = testArgs && testArgs.colors ? testArgs.colors : false;
    return new Logger(verbose, colors);
}

const getStatusColor = (status) => {
    switch (status) {
        case STATUSES.PASSED:
            return CLI_COLORS.GREEN;
        case STATUSES.FAILED:
            return CLI_COLORS.RED;
        case STATUSES.STOPPED:
            return CLI_COLORS.GREY;
        case STATUSES.FLAKY:
            return CLI_COLORS.YELLOW;
        default:
            return CLI_COLORS.DEFAULT;
    }
}

export const TESTING_HOST = process.env.LOADMILL_SERVER_HOST || "app.loadmill.com";
