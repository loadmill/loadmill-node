import * as fs from "fs";
import * as path from "path";
import isEmpty = require('lodash/isEmpty');
import isAString = require('lodash/isString');
import * as util from 'util';

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

export const printFlowRunsReport = (suiteDescription, suiteFlowRuns, logger, colors) => {
    if (suiteFlowRuns) {
        logger.log("");
        logger.log(`Test Suite [${suiteDescription}] Flow Runs report:`);
        suiteFlowRuns.map(
            f => logger.log(`Flow ${f.description} - ${coloredFlowLine(f.status, colors)}`));
    }
}

export const printTestSuitesRunsReport = (testPlanDescription, testSuitesRuns, logger, colors) => {
    if (testSuitesRuns) {
        logger.log("");
        logger.log(`Test Plan [${testPlanDescription}] Test Suites Runs report:`);
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
        case "PASSED":
            return CLI_COLORS.GREEN;
        case "FAILED":
            return CLI_COLORS.RED;
        case "STOPPED":
            return CLI_COLORS.GREY;
        case "FLAKY":
            return CLI_COLORS.YELLOW;
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

export const TESTING_HOST = process.env.LOADMILL_SERVER_HOST || "app.loadmill.com";
