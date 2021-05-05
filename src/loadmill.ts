import * as Loadmill from './index';
import * as program from 'commander';
import {
    getJSONFilesInFolderRecursively, getLogger, isUUID, getObjectAsString, 
    convertStrToArr, printFlowRunsReport, printTestSuitesRunsReport
} from './utils';
import { junitReport as createJunitReport, mochawesomeReport as createMochawesomeReport } from './reporter';

program
    .usage("<testSuiteId | load-config-file-or-folder> -t <token> [options] [parameter=value...]")
    .description(
        "Run a test suite (default option), test plan or a load test on loadmill.com.\n  " +
        "You may set parameter values by passing space-separated 'name=value' pairs, e.g. 'host=www.myapp.com port=80'.\n\n  " +
        "Learn more at https://www.npmjs.com/package/loadmill#cli"
    )
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test.")
    .option("--test-plan", "Launch a test plan.")
    .option("-s, --test-suite", "Launch a test suite (default option). If set then a test suite id must be provided instead of config file.")
    .option("-p, --parallel <parallel>", "Set the concurrency of a running test suites in a test plan")
    .option("--additional-description <description>", "Add an additional description at the end of the current suite's description - available only for test suites.")
    .option("--labels <labels>", "Run flows that are assigned to a specific label (when running a test suite).. Multiple labels can be provided by seperated them with ',' (e.g. 'label1,label2').")
    .option("--pool <pool>", "Execute tests from a dedicated agent's pool (when using private agent)")
    .option("-w, --wait", "Wait for the test to finish.")
    .option("-n, --no-bail", "Return exit code 0 even if test fails.")
    .option("-q, --quiet", "Do not print out anything (except errors).")
    .option("-v, --verbose", "Print out extra information for debugging.")
    .option("-r, --report", "Print out Test Suite Flow Runs report when the suite has ended.")
    .option("-j, --junit-report", "Create Test Suite (junit style) report when the suite has ended.")
    .option("--junit-report-path <junitReportPath>", "Save junit styled report to a path (defaults to current location).")
    .option("-m, --mochawesome-report", "Create Test Suite (mochawesome style) report when the suite has ended.")
    .option("--mochawesome-report-path <mochawesomeReportPath>", "Save JSON mochawesome styled report to a path (defaults to current location).")
    .option("--colors", "Print test results in color")
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
        junitReport,
        junitReportPath,
        mochawesomeReport,
        mochawesomeReportPath,
        parallel,
        loadTest,
        testPlan,
        additionalDescription,
        labels,
        pool,
        args: [input, ...rawParams]
    } = program;

    const logger = getLogger({ verbose, colors });

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams);

    const testSuite = !loadTest && !testPlan;
    if (verbose) {
        // verbose trumps quiet:
        quiet = false;

        logger.log("Inputs:", {
            wait,
            bail,
            quiet,
            token,
            verbose,
            colors,
            report,
            junitReport,
            junitReportPath,
            mochawesomeReport,
            mochawesomeReportPath,
            parallel,
            input,
            loadTest,
            testPlan,
            testSuite,
            additionalDescription,
            labels,
            pool,
            parameters,
        });
    }

    const loadmill = Loadmill({ token });

    const testFailed = (msg: string) => {
        logger.log("");
        logger.error(`❌ ${msg}.`);

        if (bail) {
            process.exit(1);
        }
    }

    let res: Loadmill.TestResult | undefined;

    if (testSuite) {
        const suiteLabels = convertStrToArr(labels)

        if (!isUUID(input)) { //if test suite flag is on then the input should be uuid
            validationFailed("Test suite run flag is on but no valid test suite id was provided.");
        }

        try {
            logger.verbose(`Executing suite with id ${input}`);

            let running = await loadmill.runTestSuite(
                {
                    id: input,
                    options: {
                        additionalDescription, labels: suiteLabels, pool
                    }
                },
                parameters);

            if (running && running.id) {

                if (wait) {
                    logger.verbose("Waiting for test suite run with id", running.id);
                    res = await loadmill.wait(running);

                    if (report && res.flowRuns) {
                        printFlowRunsReport(res.description, res.flowRuns, logger, colors);
                    }

                    if (res && junitReport) {
                        await createJunitReport(res, token, junitReportPath);
                    }

                    if (res && mochawesomeReport) {
                        await createMochawesomeReport(res, token, mochawesomeReportPath);
                    }

                    if (res && res.passed != null && !res.passed) {
                        testFailed(`Test suite ${res.id || input} has failed`);
                    }
                }

                if (!quiet) {
                    logger.log(res ? getObjectAsString(res, colors) : running.id);
                }

            } else {
                testFailed(`Couldn't run test suite with id ${input}`);
            }
        } catch (e) {
            if (verbose) {
                logger.error(e);
            }
            const extInfo = e.response && e.response.res && e.response.res.text;
            testFailed(`Couldn't run test suite with id ${input}. ${extInfo ? extInfo : ''}`);
        }

    }
    else if (testPlan) {
        const planLabels = convertStrToArr(labels)

        if (!isUUID(input)) { //if test plan flag is on then the input should be uuid
            validationFailed("Test plan run flag is on but no valid test plan id was provided.");
        }
        try {
            logger.verbose(`Executing test plan with id ${input}`);
            let running = await loadmill.runTestPlan(
                {
                    id: input,
                    options: {
                        additionalDescription,
                        labels: planLabels,
                        pool,
                        parallel
                    }
                },
                parameters);

            if (running && running.id) {

                if (wait) {
                    logger.verbose("Waiting for test plan run with id", running.id);
                    res = await loadmill.wait(running);

                    if (!quiet) {
                        logger.log(res ? getObjectAsString(res, colors) : running.id);
                    }

                    if (report && res.testSuitesRuns) {
                        printTestSuitesRunsReport(res.description, res.testSuitesRuns, logger, colors);
                    }

                    if (res) {
                        if (junitReport) {
                            await createJunitReport(res, token, junitReportPath);
                        }

                        if (mochawesomeReport) {
                            await createMochawesomeReport(res, token, mochawesomeReportPath);
                        }
                    }

                    if (res && res.passed != null && !res.passed) {
                        testFailed(`Test plan with id ${res.id || input} has failed`);
                    }

                }

            } else {
                testFailed(`Couldn't run test plan with id ${input}`);
            }
        } catch (e) {
            if (verbose) {
                logger.error(e);
            }
            const extInfo = e.response && e.response.res && e.response.res.text;
            testFailed(`Couldn't run test plan with id ${input}. ${extInfo ? extInfo : ''}`);
        }

    }

    else { // if test suite flag is off then the input should be fileOrFolder

        const fileOrFolder = input;
        if (!fileOrFolder) {
            validationFailed("No configuration file or folder were provided.");
        }

        const listOfFiles = getJSONFilesInFolderRecursively(fileOrFolder);
        if (listOfFiles.length === 0) {
            logger.log(`No Loadmill test files were found at ${fileOrFolder} - exiting...`);
        }

        for (let file of listOfFiles) {
            let res;

            logger.verbose(`Launching ${file} as load test`);
            const id = await loadmill.run(file, parameters);

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
    console.log('');
    program.outputHelp();
    process.exit(3);
}

function toParams(rawParams: string[]): Loadmill.Params {
    const parameters: Loadmill.Params = {};

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
