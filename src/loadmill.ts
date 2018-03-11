import * as Loadmill from './index';
import * as program from 'commander';

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
        async,
        quiet,
        token,
        verbose,
        loadTest,
        args: [file, ...rawParams]
    } = program;

    if (!file) {
        validationFailed("No configuration file provided.");
    }

    if (!token) {
        validationFailed("No API token provided.");
    }

    const parameters = toParams(rawParams);

    if (verbose) {
        // verbose trumps quiet:
        quiet = false;

        console.log("Input:", {
            file,
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

    let res, id;
    const loadmill = Loadmill({token});

    if (loadTest) {
        if (verbose) {
            console.log("Launching load test...");
        }
        id = await loadmill.run(file, parameters);
    }
    else {
        if (verbose) {
            console.log("Running functional test...");
        }

        const method = async ? 'runAsyncFunctional' : 'runFunctional';
        res = await loadmill[method](file, parameters);
    }

    if (wait && (loadTest || async)) {
        if (verbose) {
            console.log("Waiting for test:", res ? res.id : id);
        }
        res = await loadmill.wait(res || id);
    }

    if (!quiet) {
        console.log(res || id);
    }

    if (res && res.passed != null && !res.passed) {
        console.error("Test failed.");

        if (bail) {
            process.exit(1);
        }
    }
}

function validationFailed(...args) {
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
