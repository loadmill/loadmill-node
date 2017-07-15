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
    .option("-w, --wait", "Wait for the load test to finish. Functional tests are always waited on.")
    .parse(process.argv);

const {
    wait,
    token,
    loadTest,
    args: [file, ...rawParams]
} = program;

const parameters: {[key: string]: string} = {};

rawParams.forEach(pair => {
    const pivot = pair.indexOf('=');
    if (pivot <= 0) {
        console.error("Invalid parameter assignment:", pair);
        program.help();
    }

    const name = pair.slice(0, pivot);
    parameters[name] = pair.slice(pivot + 1, pair.length);
});

console.log("Input:", {
    file,
    wait,
    token,
    loadTest,
    parameters,
});


