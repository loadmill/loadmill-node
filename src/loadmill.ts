import * as Loadmill from './index';
import * as program from 'commander';
import {getJSONFilesInFolderRecursively, Logger} from './utils';

program
    .usage("<config-file> -t <token> [options] [parameter=value...]")
    .description(
        "Run a load test or a functional test on loadmill.com.\n  " +
        "You may set parameter values by passing space-separated 'name=value' pairs, e.g. 'host=www.myapp.com port=80'.\n\n  " +
        "Learn more at https://www.npmjs.com/package/loadmill#cli"
    )
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test. If not set, a functional test will run instead.")
    .option("-a, --async", "Run the test asynchronously - affects only functional tests. " +
        "Use this if your test can take longer than 25 seconds (otherwise it will timeout).")
    .option("-w, --wait", "Wait for the test to finish. Functional tests are automatically waited on " +
        "unless async flag is turned on.")
    .option("-n, --no-bail", "Return exit code 0 even if test fails.")
    .option("-q, --quiet", "Do not print out anything (except errors).")
    .option("-v, --verbose", "Print out extra information for debugging.")
    .option("-c, --local", "Execute functional test synchronously on local machine. This flag trumps load-test and async options")
    .parse(process.argv);

start()
    .catch(err => {
        console.error('\x1b[31m', err, '\x1b[0m');
        process.exit(2);
    });

async function start() {

    let {
        wait,
        bail,
        async,
        quiet,
        token,
        verbose,
        local,
        loadTest,
        args: [fileOrFolder, ...rawParams]
    } = program;

    const logger = new Logger(verbose);

    if (!fileOrFolder) {
        validationFailed("No configuration file or folder were provided.");
    }

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams);

    if (verbose) {
        // verbose trumps quiet:
        quiet = false;

        logger.log("Input:", {
            fileOrFolder,
            wait,
            bail,
            async,
            quiet,
            token,
            verbose,
            loadTest,
            parameters,
        });
    }

    const loadmill = Loadmill({token});

    const listOfFiles = getJSONFilesInFolderRecursively(fileOrFolder);
    if (listOfFiles.length === 0) {
        logger.log(`No Loadmill test files were found at ${fileOrFolder} - exiting...`);
    }

    for (let file of listOfFiles)  {
        let res, id;

        if(local) {
            logger.verbose(`Running ${file} as functional test locally`);
            res = await loadmill.runFunctionalLocally(file, parameters);
        } else {
            if (loadTest) {
                logger.verbose(`Launching ${file} as load test`);
                id = await loadmill.run(file, parameters);
            } else {
                logger.verbose(`Running ${file} as functional test`);
                const method = async ? 'runAsyncFunctional' : 'runFunctional';
                res = await loadmill[method](file, parameters);
            }
        }
        if (wait && (loadTest || async)) {
            logger.verbose("Waiting for test:", res ? res.id : id);
            res = await loadmill.wait(res || id);
        }

        if (!quiet) {
            logger.log(res || id);
        }

        if (res && res.passed != null && !res.passed) {
            logger.error(`Test ${file} failed.`);

            if (bail) {
                process.exit(1);
            }
        }
    }
}

function validationFailed(...args) {
    console.log('');
    console.error('\x1b[31m', ... args, '\x1b[0m');
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
