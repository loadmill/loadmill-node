import * as Loadmill from './index';
import * as program from 'commander';
import {
    getJSONFilesInFolderRecursively, getLogger, isUUID, isEmptyObj,
    getObjectAsString, convertStrToArr, printFlowRunsReport, printTestSuiteRunsReport
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
    .option("-a, --launch-all-test-suites", "Launch all team's test suites containing at least one flow marked for execution with CI toggle and wait for execution to end")
    .option("-p, --parallel", "Launch in parallel all team's test suites containing at least one flow marked for execution with CI toggle and wait for execution to end. Same as -a but in parallel")
    .option("--additional-description <description>", "Add an additional description at the end of the current suite's description - available only for test suites.")
    .option("--labels <labels>", "Run flows that are assigned to a specific label. Multiple labels can be provided by seperated them with ',' (e.g. 'label1,label2').")
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
        junitReport,
        junitReportPath,
        mochawesomeReport,
        mochawesomeReportPath,
        launchAllTestSuites,
        parallel,
        local,
        loadTest,
        testPlan,
        additionalDescription,
        labels,
        args: [input, ...rawParams]
    } = program;

    const logger = getLogger({ verbose, colors });

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams);

    const testSuite = !loadTest && !local && !testPlan;
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
            launchAllTestSuites,
            parallel,
            local,
            input,
            loadTest,
            testPlan,
            testSuite,
            additionalDescription,
            labels,
            parameters,
        });
    }

    const loadmill = Loadmill({ token });


    if (testSuite) {
        let results: Array<Loadmill.TestResult> = [];
        const suiteLabels = convertStrToArr(labels)

        const failedSuites: Array<string> = [];
        const testFailed = (msg: string) => {
            logger.log("");
            logger.error(`❌ ${msg}.`);

            failedSuites.push(msg);
        }

        if (launchAllTestSuites || parallel) {
            try {
                results = await loadmill.runAllExecutableTestSuites(
                    {
                        additionalDescription,
                        labels: suiteLabels,
                        parallel,
                    },
                    parameters,
                    { verbose, colors }
                );
            } catch (e) {
                if (verbose) {
                    logger.error(e);
                }
                const extInfo = e.response && e.response.res && e.response.res.text;
                testFailed(`Couldn't run all of the team test suites. ${extInfo ? extInfo : ''}`);
            }

        } else {
            if (!isUUID(input)) { //if test suite flag is on then the input should be uuid
                validationFailed("Test suite run flag is on but no valid test suite id was provided.");
            }
            try {
                logger.verbose(`Executing suite with id ${input}`);

                let running = await loadmill.runTestSuite(
                    {
                        id: input,
                        options: {
                            additionalDescription, labels: suiteLabels
                        }
                    },
                    parameters);

                if (running && running.id) {

                    if (wait) {
                        logger.verbose("Waiting for test suite run with id", running.id);
                        results.push(await loadmill.wait(running));
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

        results.forEach(async res => {
            const testSuiteRunId = res.id;
            const flowRuns = res.flowRuns;

            if (!quiet) {
                logger.log(res ? getObjectAsString(res, colors) : testSuiteRunId);
            }

            if (report && flowRuns) {
                printFlowRunsReport(res.description, flowRuns, logger, colors);
            }

            if (res && res.passed != null && !res.passed) {
                testFailed(`Test suite with id ${testSuiteRunId || input} has failed`);
            }

        });

        if (!isEmptyObj(results)) {
            if (junitReport) {
                await createJunitReport(results, token, junitReportPath);
            }

            if (mochawesomeReport) {
                await createMochawesomeReport(results, token, mochawesomeReportPath);
            }
        }

        if (!isEmptyObj(failedSuites)) {
            logger.log("");
            logger.error('Test execution errors:');
            failedSuites.forEach(s => logger.error(s));
            if (bail) {
                process.exit(1);
            }
        }

    }
    else if (testPlan) {
        let res: Loadmill.TestResult;

        const failedSuites: Array<string> = [];
        const testFailed = (msg: string) => {
            logger.log("");
            logger.error(`❌ ${msg}.`);

            failedSuites.push(msg);
        }

        if (!isUUID(input)) { //if test plan flag is on then the input should be uuid
            validationFailed("Test plan run flag is on but no valid test plan id was provided.");
        }
        try {
            logger.verbose(`Executing test plan with id ${input}`);
            let running = await loadmill.runTestPlan(
                {
                    id: input,
                    options: {
                        additionalDescription
                    }
                },
                parameters);

            if (running && running.id) {

                if (wait) {
                    logger.verbose("Waiting for test plan run with id", running.id);
                    res = await loadmill.wait(running);
                   
                    const testPlanRunId = res.id;
                    const testSuiteRuns = res.testSuitesRuns;

                    if (!quiet) {
                        logger.log(res ? getObjectAsString(res, colors) : testPlanRunId);
                    }

                    if (report && testSuiteRuns) {
                        printTestSuiteRunsReport(res.description, testSuiteRuns, logger, colors);
                    }

                    if (res && res.passed != null && !res.passed) {
                        testFailed(`Test plan with id ${testPlanRunId || input} has failed`);
                    }

                    if (res) {
                        if (junitReport) {
                            await createJunitReport(res, token, junitReportPath);
                        }
            
                        // if (mochawesomeReport) {
                        //     await createMochawesomeReport(res, token, mochawesomeReportPath);
                        // }
                    }
            
                    if (!isEmptyObj(failedSuites)) {
                        logger.log("");
                        logger.error('Test execution errors:');
                        failedSuites.forEach(s => logger.error(s));
                        if (bail) {
                            process.exit(1);
                        }
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
