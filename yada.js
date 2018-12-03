const loadmill = require('./lib/index')({token: 'lgmCXeo8D2xtL2P4GoBFlNBGo1Yhc9iEQBjwXnwd'});

console.log("here")

async function f() {
    console.log("there");
    //await loadmill.runFolder("/tmp/rivi/empty");
    //await loadmill.runFolder("/tmp/rivi/second/loadmill-npm-test2.json");
    await loadmill
        .runFolder("/tmp/rivi/")
        .then(result => console.log(result));
};

f();