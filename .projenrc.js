const { JsiiProject } = require('projen');

const project = new JsiiProject({
    name: 'cdk-appsync-project',
    repository: 'https://github.com/kcwinner/cdk-appsync-project.git',
    stability: 'experimental',
    defaultReleaseBranch: 'main',
    authorName: 'Ken Winner',
    authorAddress: 'kcswinner@gmail.com',

    entrypoint: 'lib/index.js',
    projenDevDependency: true,
    bundledDeps: ['fs-extra'],
    devDeps: ['@types/fs-extra@^8'], // This will break if it's on 9
    deps: ['projen'],
    peerDeps: ['projen'],

    eslint: false,
    mergify: false,
});

project.synth();