import * as Loadmill from './index';
import * as program from 'commander';
import {
    getLogger,
    isUUID,
    getObjectAsString, 
    convertStrToArr,
    printTestSuitesRunsReport,
    toLoadmillParams,
    readRawParams,
    printOnlyFailedFlowRunsReport,
} from './utils';
import { junitReport as createJunitReport, mochawesomeReport as createMochawesomeReport } from './reporter';

program
    .usage("<testPlanId | load-config-file> -t <token> [options] [parameter=value...]")
    .description(
        "Run a test plan (default option) or a load test on loadmill.com.\n  " +
        "You may set parameter values by passing space-separated 'name=value' pairs, e.g. 'host=www.myapp.com port=80' or supply a file using --parameters-file.\n\n  " +
        "Learn more at https://www.npmjs.com/package/loadmill#cli"
    )
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test.")
    .option("--test-plan", "Launch a test plan (default option).")
    .option("-p, --parallel <parallel>", "Set the concurrency of a running test suites in a test plan")
    .option("--additional-description <description>", "Add an additional description at the end of the current suite's description - available only for test suites.")
    .option("--labels <labels>", "Run flows that are assigned to a specific label (when running a test suite).. Multiple labels can be provided by seperated them with ',' (e.g. 'label1,label2').")
    .option("--labels-expression <labelsExpression>", "Run a test plan's suites with flows that match the labels expression. An expression may contain the characters ( ) & | ! (e.g. '(label1 | label2) & !label3')")
    .option("--pool <pool>", "Execute tests from a dedicated agent's pool (when using private agent)")
    .option("--tags <tags>", "Tag a test plan run with a comma separated list of tags (e.g. 'tag1,tag2')")
    .option("-w, --wait", "Wait for the test to finish.")
    .option("-n, --no-bail", "Return exit code 0 even if test fails.")
    .option("-q, --quiet", "Do not print out anything (except errors).")
    .option("-v, --verbose", "Print out extra information for debugging.")
    .option("-r, --report", "Print out Test Suite Flow Runs report when the plan has ended.")
    .option("--errors-report", "Print out Test Suite Flow Runs errors report when the plan has ended.")
    .option("-j, --junit-report", "Create Test Suite (junit style) report when the suite has ended.")
    .option("--junit-report-path <junitReportPath>", "Save junit styled report to a path (defaults to current location).")
    .option("-m, --mochawesome-report", "Create Test Suite (mochawesome style) report when the suite has ended.")
    .option("--mochawesome-report-path <mochawesomeReportPath>", "Save JSON mochawesome styled report to a path (defaults to current location).")
    .option("--colors", "Print test results in color")
    .option("-b, --branch <branch>", "Run the test plan's suites from a GitHub branch. The latest version of the selected Git branch will be used as the test configuration for the chosen Test Plan")
    .option("--retry-failed-flows <numberOfRetries>", "Configure the test plan to re-run failed flows in case your tested system is unstable. Tests that pass after a retry will be considered successful.")
    .option("--parameters-file <parametersFile>", "Supply a file with parameters to override. File format should be 'name=value' divided by new line.")
    .option("--inlineParameterOverride", "Override parameters strategy: by default, overrided parameters are appended to the end of the parameters list. Using this flag will replace the parameters inline.")
    .option("--apiCatalogService <apiCatalogService>", "Use the provided service when mapping the APIs in the catalog. Service will be created if not exist")
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
        errorsReport,
        junitReport,
        junitReportPath,
        mochawesomeReport,
        mochawesomeReportPath,
        parallel,
        loadTest,
        testPlan,
        additionalDescription,
        labels,
        labelsExpression,
        pool,
        tags,
        branch,
        retryFailedFlows,
        parametersFile,
        inlineParameterOverride,
        apiCatalogService,
        args: [input, ...rawParams]
    } = program;

    const logger = getLogger({ verbose, colors });

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams, parametersFile);

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
            errorsReport,
            junitReport,
            junitReportPath,
            mochawesomeReport,
            mochawesomeReportPath,
            parallel,
            input,
            loadTest,
            testPlan,
            additionalDescription,
            labels,
            labelsExpression,
            pool,
            tags,
            branch,
            retryFailedFlows,
            inlineParameterOverride,
            apiCatalogService,
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

    const testStopped = (msg: string) => {
        logger.log("");
        logger.error(`✋ ${msg}.`);

        if (bail) {
            process.exit(1);
        }
    }

    let res: Loadmill.TestResult | undefined;
    if (testPlan || !loadTest) {
        
        if (!isUUID(input)) { //if test plan flag is on then the input should be uuid
            validationFailed("Test plan run flag is on but no valid test plan id was provided.");
        }

        const planLabels = convertStrToArr(labels);
        const planTags = convertStrToArr(tags);
        
        try {
            logger.verbose(`Executing test plan with id ${input}`);
            let running = await loadmill.runTestPlan(
                {
                    id: input,
                    options: {
                        additionalDescription,
                        labels: planLabels,
                        labelsExpression,
                        pool,
                        tags : planTags,
                        parallel, 
                        branch,
                        maxFlakyFlowRetries: retryFailedFlows,
                        inlineParameterOverride,
                        apiCatalogService,
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

                    if (errorsReport && res.testSuitesRuns) {
                        printOnlyFailedFlowRunsReport(res.testSuitesRuns, logger, colors);
                    }

                    if (res) {
                        if (junitReport) {
                            await createJunitReport(res, token, junitReportPath);
                        }

                        if (mochawesomeReport) {
                            await createMochawesomeReport(res, token, mochawesomeReportPath);
                        }
                    }

                    if (res && res.status === 'STOPPED') {
                        testStopped(`Test plan with id ${res.id || input} has stopped`);
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
            testFailed(`Couldn't run test plan with id ${input} ${extInfo ? extInfo : ''}`);
        }

    }

    else { // if test plan flag is off then the input should be a conf file

        const configFile = input;
        if (!configFile) {
            validationFailed("No configuration file were provided.");
        }
        let res;

        logger.verbose(`Launching ${configFile} as load test`);
        const id = await loadmill.run(configFile, parameters);

        if (wait && loadTest) {
            logger.verbose("Waiting for test:", res ? res.id : id);
            res = await loadmill.wait(res || id);
        }

        if (!quiet) {
            logger.log(JSON.stringify(res, null, 4) || id);
        }

        if (res && res.passed != null && !res.passed) {
            logger.error(`❌  Test ${configFile} failed.`);

            if (bail) {
                process.exit(1);
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

function toParams(rawParams: string[], filePath?: string): Loadmill.Params {
    try {
        const paramsArray = filePath ? [...readRawParams(filePath), ...rawParams] : rawParams;
        return toLoadmillParams(paramsArray);
    } catch (err) {
        validationFailed(err.message);
        return {};
    }
}
