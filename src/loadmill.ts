import * as Loadmill from './index';
import * as program from 'commander';
import { getJSONFilesInFolderRecursively, Logger, isUUID, 
    getObjectAsString, convertStrToArr, printFlowRunsReport } from './utils';

program
    .usage("<testSuiteId | load-config-file-or-folder> -t <token> [options] [parameter=value...]")
    .description(
        "Run a test suite (default option) or a load test on loadmill.com.\n  " +
        "You may set parameter values by passing space-separated 'name=value' pairs, e.g. 'host=www.myapp.com port=80'.\n\n  " +
        "Learn more at https://www.npmjs.com/package/loadmill#cli"
    )
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test.")
    .option("-s, --test-suite", "Launch a test suite (default option). If set then a test suite id must be provided instead of config file.")
    .option("--additional-description <description>", "Add an additional description at the end of the current suite's description - available only for test suites.")
    .option("--labels <labels>", "Run flows that are assigned to a specific label. Multiple labels can be provided by seperated them with ',' (e.g. 'label1,label2').")
    .option("-w, --wait", "Wait for the test to finish.")
    .option("-n, --no-bail", "Return exit code 0 even if test fails.")
    .option("-q, --quiet", "Do not print out anything (except errors).")
    .option("-v, --verbose", "Print out extra information for debugging.")
    .option("-r, --report", "Print out Test Suite Flow Runs report when the suite has ended.")
    .option("--colors", "Print test results in color")
    .option("-c, --local", "Execute functional test synchronously on local machine. This flag trumps load-test option")
    .parse(process.argv);

start()
    .catch(err => {
        console.error(err);
        process.exit(2);
    });

async function start() {
    
    let {
        wait,
        bail,
        quiet,
        token,
        verbose,
        colors,
        report,
        local,
        loadTest,
        additionalDescription,
        labels,
        args: [input, ...rawParams]
    } = program;

    const logger = new Logger(verbose, colors);

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams);

    const testSuite = !loadTest && !local;
    if (verbose) {
        // verbose trumps quiet:
        quiet = false;

        logger.log("Inputs:", {
            input,
            wait,
            bail,
            quiet,
            token,
            verbose,
            report,
            testSuite,
            loadTest,
            local,
            additionalDescription,
            labels,
            parameters,
        });
    }

    const loadmill = Loadmill({ token });

    if (testSuite) {
        if (!isUUID(input)) { //if test suite flag is on then the input should be uuid
            validationFailed("Test suite run flag is on but no valid test suite id was provided.");
        }
        let res, flowRuns;
        const suite: Loadmill.TestSuiteDef = { id: input, additionalDescription, labels: convertStrToArr(labels) };
        try {
            let running = await loadmill.runTestSuite(suite, parameters);

            if (running && running.id) {

                const testSuiteRunId = running.id;

                if (wait) {
                    logger.verbose("Waiting for test suite:", testSuiteRunId);
                    res = await loadmill.wait(running);
                    flowRuns = res.flowRuns;
                    delete res.flowRuns; // dont want to print these in getObjectAsString
                }

                if (!quiet) {
                    logger.log(res ? getObjectAsString(res, colors) : testSuiteRunId);
                }

                if(report && flowRuns) {
                    printFlowRunsReport(flowRuns, logger, colors);
                }

                if (res && res.passed != null && !res.passed) {
                    testFailed(logger, `Test suite with id ${input} failed`, bail);
                }

            } else {
                testFailed(logger, `Couldn't run test suite with id ${input}`, bail);
            }
        } catch (e) {
            if (verbose) {
                logger.error(e);
            }
            const extInfo = e.response && e.response.res && e.response.res.text;
            testFailed(logger, `Couldn't run test suite with id ${input}. ${extInfo ? extInfo : ''}`, bail);
        }

    } else { // if test suite flag is off then the input should be fileOrFolder

        const fileOrFolder = input;
        if (!fileOrFolder) {
            validationFailed("No configuration file or folder were provided.");
        }

        const listOfFiles = getJSONFilesInFolderRecursively(fileOrFolder);
        if (listOfFiles.length === 0) {
            logger.log(`No Loadmill test files were found at ${fileOrFolder} - exiting...`);
        }

        for (let file of listOfFiles) {
            let res, id;

            if (local) {
                logger.verbose(`Running ${file} as functional test locally`);
                res = await loadmill.runFunctionalLocally(file, parameters, undefined, { verbose, colors });
            } else {
                logger.verbose(`Launching ${file} as load test`);
                id = await loadmill.run(file, parameters);
            }
            if (wait && loadTest) {
                logger.verbose("Waiting for test:", res ? res.id : id);
                res = await loadmill.wait(res || id);
            }

            if (!quiet) {
                logger.log(JSON.stringify(res, null, 4) || id);
            }

            if (res && res.passed != null && !res.passed) {
                logger.error(`❌  Test ${file} failed.`);

                if (bail) {
                    process.exit(1);
                }
            }
        }
    }
}

function validationFailed(...args) {
    console.log('');
    console.error(...args);
    program.outputHelp();
    process.exit(3);
}

function toParams(rawParams: string[]) {
    const parameters: { [key: string]: string } = {};

    rawParams.forEach(pair => {
        const pivot = pair.indexOf('=');

        if (pivot <= 0) {
            validationFailed("Invalid parameter assignment:", pair);
        }

        const name = pair.slice(0, pivot);
        parameters[name] = pair.slice(pivot + 1, pair.length);
    });

    return parameters;
}

function testFailed(logger, msg, bail) {
    logger.error(`❌ ${msg}.`);

    if (bail) {
        process.exit(1);
    }
}
