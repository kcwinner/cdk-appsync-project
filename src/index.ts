import * as fs from 'fs-extra';
import * as path from 'path';
import { AwsCdkTypeScriptApp, AwsCdkTypeScriptAppOptions, Component, SampleDir } from 'projen';
import { pascalCase } from './pascalCase';

export interface AwsCdkAppSyncAppOptions extends AwsCdkTypeScriptAppOptions {
  /**
   * cdk-appsync-transformer version to use.
   *
   * @default "1.77.15"
   */
  readonly transformerVersion: string;
}

/**
 * AWS CDK AppSync Transformer App in TypeScript
 *
 * @pjid awscdk-appsync-app-ts
 */
export class AwsCdkAppSyncApp extends AwsCdkTypeScriptApp {
  constructor(options: AwsCdkAppSyncAppOptions) {
    super({
      ...options,
      sampleCode: false,
    });

    const transformerVersion = options.cdkVersionPinning
      ? `^${options.transformerVersion}`
      : options.transformerVersion

    this.addDeps(`cdk-appsync-transformer@${transformerVersion}`)

    this.addCdkDependency(...[
      '@aws-cdk/core',
      '@aws-cdk/aws-appsync',
      '@aws-cdk/aws-cognito',
      '@aws-cdk/aws-dynamodb',
      '@aws-cdk/aws-iam',
    ]);

    this.gitignore.exclude('appsync/');
    this.npmignore?.exclude('appsync/');

    if (options.sampleCode ?? true) {
      new SampleCode(this);
    }
  }
}

class SampleCode extends Component {
  private readonly appProject: AwsCdkAppSyncApp;
  private readonly projectName: string;

  constructor(project: AwsCdkAppSyncApp) {
    super(project);
    this.appProject = project;
    this.projectName = path.basename(process.cwd());
  }

  public synthesize() {
    const srcdir = path.join(this.project.outdir, this.appProject.srcdir);
    if (fs.pathExistsSync(srcdir) && fs.readdirSync(srcdir).filter(x => x.endsWith('.ts'))) {
      return;
    }

    const projectType = pascalCase(this.projectName);

    new SampleDir(this.project, this.appProject.srcdir, {
      files: {
        'main.ts': this.createMainTsContents(this.projectName, projectType),
      },
    });

    const libDir = path.join(this.appProject.srcdir, 'lib');
    new SampleDir(this.appProject, libDir, {
      files: {
        [`${this.projectName}-stack.ts`]: this.createProjectStackContents(projectType),
      },
    });

    const testCode = `import '@aws-cdk/assert/jest';
import { MyStack } from '../src/main'
import { App } from '@aws-cdk/core';

test('Snapshot', () => {
  const app = new App();
  const stack = new MyStack(app, 'test');

  expect(stack).toHaveResource('AWS::Cognito::UserPool');
  expect(stack.api.nestedAppsyncStack).toHaveResource('AWS::AppSync::GraphQLApi');
});`;

    new SampleDir(this.project, this.appProject.testdir, {
      files: {
        'main.test.ts': testCode
      }
    })

    const sampleSchema = this.createSampleSchema();
    fs.writeFileSync(path.join(this.project.outdir, 'schema.graphql'), sampleSchema);
  }

  private createMainTsContents(projectName: string, projectType: string): string {
    return `import { App } from '@aws-cdk/core';
import { ${projectType}Stack } from './lib/${projectName}-stack';
const STAGE = process.env.STAGE || 'dev'; // default to dev as the stage
const ACCOUNT = process.env.ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const REGION = process.env.REGION || 'us-east-2'; // default region we are using
const app = new App(
  {
    context: {
      STAGE: STAGE,
    },
  },
);

new ${projectType}Stack(app, \`${projectName}-\${STAGE}\`, {
  terminationProtection: true,
  description: 'Stack for ${projectName}',
  env: {
    account: ACCOUNT,
    region: REGION,
  },
});
app.synth();`;
  }

  private createProjectStackContents(projectType: string): string {
    return `import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { AuthorizationType, UserPoolDefaultAction } from '@aws-cdk/aws-appsync';
import { CfnIdentityPool, UserPool, UserPoolClient, VerificationEmailStyle } from '@aws-cdk/aws-cognito';
import { Role, WebIdentityPrincipal } from '@aws-cdk/aws-iam';

import { AppSyncTransformer } from 'cdk-appsync-transformer';

export interface ${projectType}StackProps extends StackProps { }

export class ${projectType}Stack extends Stack {
  public userPool: UserPool;
  public appsyncTransformer: AppSyncTransformer

  constructor(scope: Construct, id: string, props: ${projectType}StackProps = {}) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'user-pool', {
      autoVerify: {
        email: true,
        phone: false
      },
      selfSignUpEnabled: true,
      signInAliases: {
        email: true
      },
      standardAttributes: {
        email: {
          mutable: true,
          required: true
        },
      },
      userVerification: {
        emailSubject: 'Verify your email',
        emailBody: 'Hello {username}! Your verification code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
      }
    });

    const userpoolWebClient = new UserPoolClient(this, 'user-pool-client', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
      }
    });

    const identityPool = new CfnIdentityPool(this, 'identity-pool', {
      cognitoIdentityProviders: [
        {
          clientId: userpoolWebClient.userPoolClientId,
          providerName: \`cognito-idp.\${this.region}.amazonaws.com/\${this.userPool.userPoolId}\`,
        },
      ],
      allowUnauthenticatedIdentities: true,
    });

    const unauthRole = new Role(this, 'unauth-role', {
      assumedBy: new WebIdentityPrincipal('cognito-identity.amazonaws.com')
        .withConditions({
          'StringEquals': { 'cognito-identity.amazonaws.com:aud': \`\${identityPool.ref}\` },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' },
        }),
    });

    const authRole = new Role(this, 'auth-role', {
      assumedBy: new WebIdentityPrincipal('cognito-identity.amazonaws.com')
        .withConditions({
          'StringEquals': { 'cognito-identity.amazonaws.com:aud': \`\${identityPool.ref}\` },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        }),
    });

    this.appsyncTransformer = new AppSyncTransformer(this, 'appsync-api', {
      schemaPath: './schema.graphql',
      apiName: 'my-cool-api',
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: this.userPool,
            appIdClientRegex: userpoolWebClient.userPoolClientId,
            defaultAction: UserPoolDefaultAction.ALLOW
          }
        }
      }
    });

    this.appsyncTransformer.grantPublic(unauthRole);
  }
}`
  }

  private createSampleSchema(): string {
    return `# This is a sample generated schema
type Customer @model
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: private, provider: iam, operations: [read, update] }
    ]) {
        id: ID!
        firstName: String!
        lastName: String!
        active: Boolean!
        address: String!
}

type Product @model
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: public, provider: iam, operations: [read] }
    ]) {
        id: ID!
        name: String!
        description: String!
        price: String!
        active: Boolean!
        added: AWSDateTime!
        orders: [Order] @connection
}

type Order @model
    @key(fields: ["id", "productID"]) {
        id: ID!
        productID: ID!
        total: String!
        ordered: AWSDateTime!
}

# Demonstrate the FUNCTION resolvers
type User @model(queries: null, mutations: null, subscriptions: null)
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: owner, ownerField: "sub" },
        { allow: private, provider: iam, operations: [create, update] }
    ]) {
    id: ID!
    enabled: Boolean!
    status: String!
    email: String!
    name: String!
    email_verified: String
    phone_number: String
    phone_number_verified: String
}

type UserConnection {
    items: [User]
}

input CreateUserInput {
    email: String!
    name: String!
}

input UpdateUserInput {
    id: ID!
    email: String
    name: String
    number: String
}

# Demonstrate the FUNCTION resolvers
type Query {
  listUsers: UserConnection @function(name: "router")
  getUser(id: ID!): User @function(name: "router")
}

type Mutation {
  createUser(input: CreateUserInput!): User @function(name: "router")
  updateUser(input: UpdateUserInput!): User @function(name: "router")
}`;
  }
}