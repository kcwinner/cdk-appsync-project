import { AwsCdkAppSyncApp } from '../src';

test('Empty', () => {
  const project = new AwsCdkAppSyncApp({
    name: 'test',
    cdkVersion: '1.80.0',
    transformerVersion: '1.77.9',
    defaultReleaseBranch: 'main'
  });

  expect(project.cdkVersion).toEqual('^1.80.0');
  expect(project.srcdir).toEqual('src');
  expect(project.libdir).toEqual('lib');

  // TODO: Fix this as it does not work
  // const cdkAppsyncTransformer = project.deps.getDependency('cdk-appsync-transformer');
  
  // expect(dependencies['cdk-appsync-transformer']).toEqual('^1.77.9');
});