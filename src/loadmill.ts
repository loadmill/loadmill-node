import * as program from 'commander';

program
    .usage("<config-file> -t <token> [options] [parameter=value...]")
    .description("Launch a load test or run a functional test on loadmill.com. " +
        "You may assign parameter values by passing arguments such as 'loadmill test.json host=www.myapp.com port=80'.")
    .option("-t, --token <token>", "Loadmill API Token. You must provide a token in order to run tests.")
    .option("-l, --load-test", "Launch a load test. If not set, a functional test will run instead.")
    .option("-w, --wait", "Wait for the load test to finish.")
    .parse(process.argv);

const {
    wait,
    token,
    loadTest,
    args: [file, ...parameters]
} = program;

console.log("Input:", {
    file,
    wait,
    token,
    loadTest,
    parameters,
});


