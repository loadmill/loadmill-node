# Loadmill
Users of [Loadmill](https://www.loadmill.com) can use this node module to: 
1. Run load tests on loadmill.com.
2. Run functional tests on loadmill.com.
3. Do both programmatically or via CLI.

## Installation
Using npm:

`npm install loadmill --save`

Using yarn:

`yarn add loadmill`

## Usage
The following code runs a very simple load test that gets a single page from `www.myapp.com` every second for one minute:
```js
const loadmill = require('loadmill')({token: process.env.LOADMILL_API_TOKEN});

// You may also give a path to a valid JSON file instead:
loadmill.run({requests: [{url: "www.myapp.com"}]}, (err, id) => {
    if (!err) {
        console.log("Load test started: " + id);
    }
});
```

### Test Configuration
The JSON test configuration may be exported from the loadmill test editor or from an old test run.
Read more about the configuration format [here](https://docs.loadmill.com/test-configurations.html).  

### Using Promises
Every function that accepts a callback will return a promise instead if no callback is provided (and vice versa):
```js
loadmill.run("./load-tests/simple.json")
    .then(id => console.log("Load test started: ", id))
    .catch(err => console.error("Something bad: ", err));
```

### Waiting for Tests
Since load tests usually run for at least a few minutes, the loadmill client does not wait for them to finish by default.
You can explicitly wait for a test to finish using the `wait` function:
 ```js
loadmill.run("./load-tests/long_test.json")
    .then(loadmill.wait)
    // -> {id: string, passed: boolean, url: string}
    .then(result => console.log(result));
```

### Functional Tests
You may also use a test configuration to run a functional test (i.e. a single iteration of requests) - this is usually useful for testing your API for regressions after every new deployment.
Functional tests are expected to be shorter and thus are awaited on by default:
```js
loadmill.runFunctional("./load-tests/api_test.json")
    // -> {id: string, passed: boolean, url: string}
    .then(result => console.log(result));
```

### Parameters
You will usually want some part of your test to be _dynamic_, e.g. the host name of the tested server.
With Loadmill, this is made easy by using [parameters](https://docs.loadmill.com/parameters.html).
You may set/override parameter defaults for a test by passing a hash mapping parameter names to values:
```js
// Parameters may come before or instead of a callback:
loadmill.run("./load-tests/parametrized_test.json", {host: "test.myapp.com", port: 4443}, (err, id) => {/*...*/});

// You may also use predefined parameter values as well:
loadmill.runFunctional("./load-tests/parametrized_test.json", {host: "test.${parentDomain}"});
```

## CLI
Coming Soon...
