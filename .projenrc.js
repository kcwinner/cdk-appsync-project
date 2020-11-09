const { JsiiProject } = require('projen');

const project = new JsiiProject({
    name: 'cdk-appsync-project',
    repository: 'https://github.com/kcwinner/cdk-appsync-project.git',
    stability: 'experimental',
    authorName: 'Ken Winner',
    authorAddress: 'kcswinner@gmail.com',
    entrypoint: 'lib/index.js',
    devDeps: ['@types/fs-extra@^8'], // This will break if it's on 9
    deps: ['projen'],
    peerDeps: [ 'projen' ],
    bundledDeps: ['fs-extra'],
    eslint: false,
    mergify: false,
    projenDevDependency: true,
    // codeCov: true
});

project.synth();