"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsCdkAppSyncApp = void 0;
const fs = require("fs-extra");
const path = require("path");
const projen_1 = require("projen");
const pascalCase_1 = require("./pascalCase");
/**
 * (experimental) AWS CDK AppSync Transformer App in TypeScript.
 *
 * @experimental
 * @pjid awscdk-appsync-app-ts
 */
class AwsCdkAppSyncApp extends projen_1.AwsCdkTypeScriptApp {
    /**
     * @experimental
     */
    constructor(options) {
        var _a, _b;
        super({
            ...options,
            sampleCode: false,
        });
        const transformerVersion = options.cdkVersionPinning
            ? `^${options.transformerVersion}`
            : options.transformerVersion;
        this.addDeps(`cdk-appsync-transformer@${transformerVersion}`);
        this.addCdkDependency(...[
            '@aws-cdk/core',
            '@aws-cdk/aws-appsync',
            '@aws-cdk/aws-cognito',
            '@aws-cdk/aws-dynamodb',
            '@aws-cdk/aws-iam',
        ]);
        this.gitignore.exclude('appsync/');
        (_a = this.npmignore) === null || _a === void 0 ? void 0 : _a.exclude('appsync/');
        if ((_b = options.sampleCode) !== null && _b !== void 0 ? _b : true) {
            new SampleCode(this);
        }
    }
}
exports.AwsCdkAppSyncApp = AwsCdkAppSyncApp;
class SampleCode extends projen_1.Component {
    constructor(project) {
        super(project);
        this.appProject = project;
        this.projectName = path.basename(process.cwd());
    }
    synthesize() {
        const srcdir = path.join(this.project.outdir, this.appProject.srcdir);
        if (fs.pathExistsSync(srcdir) && fs.readdirSync(srcdir).filter(x => x.endsWith('.ts'))) {
            return;
        }
        const projectType = pascalCase_1.pascalCase(this.projectName);
        new projen_1.SampleDir(this.project, this.appProject.srcdir, {
            files: {
                'main.ts': this.createMainTsContents(this.projectName, projectType),
            },
        });
        const libDir = path.join(this.appProject.srcdir, 'lib');
        new projen_1.SampleDir(this.appProject, libDir, {
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
        new projen_1.SampleDir(this.project, this.appProject.testdir, {
            files: {
                'main.test.ts': testCode
            }
        });
        const sampleSchema = this.createSampleSchema();
        fs.writeFileSync(path.join(this.project.outdir, 'schema.graphql'), sampleSchema);
    }
    createMainTsContents(projectName, projectType) {
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
    createProjectStackContents(projectType) {
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
    this.appsyncTransformer.grantPrivate(authRole);
  }
}`;
    }
    createSampleSchema() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQStCO0FBQy9CLDZCQUE2QjtBQUM3QixtQ0FBK0Y7QUFDL0YsNkNBQTBDOzs7Ozs7O0FBZ0IxQyxNQUFhLGdCQUFpQixTQUFRLDRCQUFtQjs7OztJQUN2RCxZQUFZLE9BQWdDOztRQUMxQyxLQUFLLENBQUM7WUFDSixHQUFHLE9BQU87WUFDVixVQUFVLEVBQUUsS0FBSztTQUNsQixDQUFDLENBQUM7UUFFSCxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxpQkFBaUI7WUFDbEQsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLGtCQUFrQixFQUFFO1lBQ2xDLENBQUMsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUE7UUFFOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsa0JBQWtCLEVBQUUsQ0FBQyxDQUFBO1FBRTdELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHO1lBQ3ZCLGVBQWU7WUFDZixzQkFBc0I7WUFDdEIsc0JBQXNCO1lBQ3RCLHVCQUF1QjtZQUN2QixrQkFBa0I7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkMsTUFBQSxJQUFJLENBQUMsU0FBUywwQ0FBRSxPQUFPLENBQUMsVUFBVSxFQUFFO1FBRXBDLFVBQUksT0FBTyxDQUFDLFVBQVUsbUNBQUksSUFBSSxFQUFFO1lBQzlCLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RCO0lBQ0gsQ0FBQztDQUNGO0FBNUJELDRDQTRCQztBQUVELE1BQU0sVUFBVyxTQUFRLGtCQUFTO0lBSWhDLFlBQVksT0FBeUI7UUFDbkMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUM7UUFDMUIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTSxVQUFVO1FBQ2YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RFLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtZQUN0RixPQUFPO1NBQ1I7UUFFRCxNQUFNLFdBQVcsR0FBRyx1QkFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVqRCxJQUFJLGtCQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRTtZQUNsRCxLQUFLLEVBQUU7Z0JBQ0wsU0FBUyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQzthQUNwRTtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEQsSUFBSSxrQkFBUyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFO1lBQ3JDLEtBQUssRUFBRTtnQkFDTCxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsV0FBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFdBQVcsQ0FBQzthQUMvRTtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHOzs7Ozs7Ozs7O0lBVWpCLENBQUM7UUFFRCxJQUFJLGtCQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtZQUNuRCxLQUFLLEVBQUU7Z0JBQ0wsY0FBYyxFQUFFLFFBQVE7YUFDekI7U0FDRixDQUFDLENBQUE7UUFFRixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUMvQyxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRU8sb0JBQW9CLENBQUMsV0FBbUIsRUFBRSxXQUFtQjtRQUNuRSxPQUFPO1dBQ0EsV0FBVyx1QkFBdUIsV0FBVzs7Ozs7Ozs7Ozs7O01BWWxELFdBQVcsZ0JBQWdCLFdBQVc7OzRCQUVoQixXQUFXOzs7Ozs7YUFNMUIsQ0FBQztJQUNaLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxXQUFtQjtRQUNwRCxPQUFPOzs7Ozs7O21CQU9RLFdBQVc7O2VBRWYsV0FBVzs7OztxREFJMkIsV0FBVzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUE2RTlELENBQUE7SUFDQSxDQUFDO0lBRU8sa0JBQWtCO1FBQ3hCLE9BQU87Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBNkVULENBQUM7SUFDRCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcy1leHRyYSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQXdzQ2RrVHlwZVNjcmlwdEFwcCwgQXdzQ2RrVHlwZVNjcmlwdEFwcE9wdGlvbnMsIENvbXBvbmVudCwgU2FtcGxlRGlyIH0gZnJvbSAncHJvamVuJztcbmltcG9ydCB7IHBhc2NhbENhc2UgfSBmcm9tICcuL3Bhc2NhbENhc2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF3c0Nka0FwcFN5bmNBcHBPcHRpb25zIGV4dGVuZHMgQXdzQ2RrVHlwZVNjcmlwdEFwcE9wdGlvbnMge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICByZWFkb25seSB0cmFuc2Zvcm1lclZlcnNpb246IHN0cmluZztcbn1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG5leHBvcnQgY2xhc3MgQXdzQ2RrQXBwU3luY0FwcCBleHRlbmRzIEF3c0Nka1R5cGVTY3JpcHRBcHAge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBBd3NDZGtBcHBTeW5jQXBwT3B0aW9ucykge1xuICAgIHN1cGVyKHtcbiAgICAgIC4uLm9wdGlvbnMsXG4gICAgICBzYW1wbGVDb2RlOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRyYW5zZm9ybWVyVmVyc2lvbiA9IG9wdGlvbnMuY2RrVmVyc2lvblBpbm5pbmdcbiAgICAgID8gYF4ke29wdGlvbnMudHJhbnNmb3JtZXJWZXJzaW9ufWBcbiAgICAgIDogb3B0aW9ucy50cmFuc2Zvcm1lclZlcnNpb25cblxuICAgIHRoaXMuYWRkRGVwcyhgY2RrLWFwcHN5bmMtdHJhbnNmb3JtZXJAJHt0cmFuc2Zvcm1lclZlcnNpb259YClcblxuICAgIHRoaXMuYWRkQ2RrRGVwZW5kZW5jeSguLi5bXG4gICAgICAnQGF3cy1jZGsvY29yZScsXG4gICAgICAnQGF3cy1jZGsvYXdzLWFwcHN5bmMnLFxuICAgICAgJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJyxcbiAgICAgICdAYXdzLWNkay9hd3MtZHluYW1vZGInLFxuICAgICAgJ0Bhd3MtY2RrL2F3cy1pYW0nLFxuICAgIF0pO1xuXG4gICAgdGhpcy5naXRpZ25vcmUuZXhjbHVkZSgnYXBwc3luYy8nKTtcbiAgICB0aGlzLm5wbWlnbm9yZT8uZXhjbHVkZSgnYXBwc3luYy8nKTtcblxuICAgIGlmIChvcHRpb25zLnNhbXBsZUNvZGUgPz8gdHJ1ZSkge1xuICAgICAgbmV3IFNhbXBsZUNvZGUodGhpcyk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFNhbXBsZUNvZGUgZXh0ZW5kcyBDb21wb25lbnQge1xuICBwcml2YXRlIHJlYWRvbmx5IGFwcFByb2plY3Q6IEF3c0Nka0FwcFN5bmNBcHA7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJvamVjdE5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihwcm9qZWN0OiBBd3NDZGtBcHBTeW5jQXBwKSB7XG4gICAgc3VwZXIocHJvamVjdCk7XG4gICAgdGhpcy5hcHBQcm9qZWN0ID0gcHJvamVjdDtcbiAgICB0aGlzLnByb2plY3ROYW1lID0gcGF0aC5iYXNlbmFtZShwcm9jZXNzLmN3ZCgpKTtcbiAgfVxuXG4gIHB1YmxpYyBzeW50aGVzaXplKCkge1xuICAgIGNvbnN0IHNyY2RpciA9IHBhdGguam9pbih0aGlzLnByb2plY3Qub3V0ZGlyLCB0aGlzLmFwcFByb2plY3Quc3JjZGlyKTtcbiAgICBpZiAoZnMucGF0aEV4aXN0c1N5bmMoc3JjZGlyKSAmJiBmcy5yZWFkZGlyU3luYyhzcmNkaXIpLmZpbHRlcih4ID0+IHguZW5kc1dpdGgoJy50cycpKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHByb2plY3RUeXBlID0gcGFzY2FsQ2FzZSh0aGlzLnByb2plY3ROYW1lKTtcblxuICAgIG5ldyBTYW1wbGVEaXIodGhpcy5wcm9qZWN0LCB0aGlzLmFwcFByb2plY3Quc3JjZGlyLCB7XG4gICAgICBmaWxlczoge1xuICAgICAgICAnbWFpbi50cyc6IHRoaXMuY3JlYXRlTWFpblRzQ29udGVudHModGhpcy5wcm9qZWN0TmFtZSwgcHJvamVjdFR5cGUpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGxpYkRpciA9IHBhdGguam9pbih0aGlzLmFwcFByb2plY3Quc3JjZGlyLCAnbGliJyk7XG4gICAgbmV3IFNhbXBsZURpcih0aGlzLmFwcFByb2plY3QsIGxpYkRpciwge1xuICAgICAgZmlsZXM6IHtcbiAgICAgICAgW2Ake3RoaXMucHJvamVjdE5hbWV9LXN0YWNrLnRzYF06IHRoaXMuY3JlYXRlUHJvamVjdFN0YWNrQ29udGVudHMocHJvamVjdFR5cGUpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRlc3RDb2RlID0gYGltcG9ydCAnQGF3cy1jZGsvYXNzZXJ0L2plc3QnO1xuaW1wb3J0IHsgTXlTdGFjayB9IGZyb20gJy4uL3NyYy9tYWluJ1xuaW1wb3J0IHsgQXBwIH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbnRlc3QoJ1NuYXBzaG90JywgKCkgPT4ge1xuICBjb25zdCBhcHAgPSBuZXcgQXBwKCk7XG4gIGNvbnN0IHN0YWNrID0gbmV3IE15U3RhY2soYXBwLCAndGVzdCcpO1xuXG4gIGV4cGVjdChzdGFjaykudG9IYXZlUmVzb3VyY2UoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnKTtcbiAgZXhwZWN0KHN0YWNrLmFwaS5uZXN0ZWRBcHBzeW5jU3RhY2spLnRvSGF2ZVJlc291cmNlKCdBV1M6OkFwcFN5bmM6OkdyYXBoUUxBcGknKTtcbn0pO2A7XG5cbiAgICBuZXcgU2FtcGxlRGlyKHRoaXMucHJvamVjdCwgdGhpcy5hcHBQcm9qZWN0LnRlc3RkaXIsIHtcbiAgICAgIGZpbGVzOiB7XG4gICAgICAgICdtYWluLnRlc3QudHMnOiB0ZXN0Q29kZVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCBzYW1wbGVTY2hlbWEgPSB0aGlzLmNyZWF0ZVNhbXBsZVNjaGVtYSgpO1xuICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHRoaXMucHJvamVjdC5vdXRkaXIsICdzY2hlbWEuZ3JhcGhxbCcpLCBzYW1wbGVTY2hlbWEpO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVNYWluVHNDb250ZW50cyhwcm9qZWN0TmFtZTogc3RyaW5nLCBwcm9qZWN0VHlwZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYGltcG9ydCB7IEFwcCB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0IHsgJHtwcm9qZWN0VHlwZX1TdGFjayB9IGZyb20gJy4vbGliLyR7cHJvamVjdE5hbWV9LXN0YWNrJztcbmNvbnN0IFNUQUdFID0gcHJvY2Vzcy5lbnYuU1RBR0UgfHwgJ2Rldic7IC8vIGRlZmF1bHQgdG8gZGV2IGFzIHRoZSBzdGFnZVxuY29uc3QgQUNDT1VOVCA9IHByb2Nlc3MuZW52LkFDQ09VTlQgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVDtcbmNvbnN0IFJFR0lPTiA9IHByb2Nlc3MuZW52LlJFR0lPTiB8fCAndXMtZWFzdC0yJzsgLy8gZGVmYXVsdCByZWdpb24gd2UgYXJlIHVzaW5nXG5jb25zdCBhcHAgPSBuZXcgQXBwKFxuICB7XG4gICAgY29udGV4dDoge1xuICAgICAgU1RBR0U6IFNUQUdFLFxuICAgIH0sXG4gIH0sXG4pO1xuXG5uZXcgJHtwcm9qZWN0VHlwZX1TdGFjayhhcHAsIFxcYCR7cHJvamVjdE5hbWV9LVxcJHtTVEFHRX1cXGAsIHtcbiAgdGVybWluYXRpb25Qcm90ZWN0aW9uOiB0cnVlLFxuICBkZXNjcmlwdGlvbjogJ1N0YWNrIGZvciAke3Byb2plY3ROYW1lfScsXG4gIGVudjoge1xuICAgIGFjY291bnQ6IEFDQ09VTlQsXG4gICAgcmVnaW9uOiBSRUdJT04sXG4gIH0sXG59KTtcbmFwcC5zeW50aCgpO2A7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVByb2plY3RTdGFja0NvbnRlbnRzKHByb2plY3RUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgaW1wb3J0IHsgQ29uc3RydWN0LCBTdGFjaywgU3RhY2tQcm9wcyB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0IHsgQXV0aG9yaXphdGlvblR5cGUsIFVzZXJQb29sRGVmYXVsdEFjdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcHBzeW5jJztcbmltcG9ydCB7IENmbklkZW50aXR5UG9vbCwgVXNlclBvb2wsIFVzZXJQb29sQ2xpZW50LCBWZXJpZmljYXRpb25FbWFpbFN0eWxlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWNvZ25pdG8nO1xuaW1wb3J0IHsgUm9sZSwgV2ViSWRlbnRpdHlQcmluY2lwYWwgfSBmcm9tICdAYXdzLWNkay9hd3MtaWFtJztcblxuaW1wb3J0IHsgQXBwU3luY1RyYW5zZm9ybWVyIH0gZnJvbSAnY2RrLWFwcHN5bmMtdHJhbnNmb3JtZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlICR7cHJvamVjdFR5cGV9U3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMgeyB9XG5cbmV4cG9ydCBjbGFzcyAke3Byb2plY3RUeXBlfVN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBwdWJsaWMgdXNlclBvb2w6IFVzZXJQb29sO1xuICBwdWJsaWMgYXBwc3luY1RyYW5zZm9ybWVyOiBBcHBTeW5jVHJhbnNmb3JtZXJcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogJHtwcm9qZWN0VHlwZX1TdGFja1Byb3BzID0ge30pIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgVXNlclBvb2wodGhpcywgJ3VzZXItcG9vbCcsIHtcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIHBob25lOiBmYWxzZVxuICAgICAgfSxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZVxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWVcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ1ZlcmlmeSB5b3VyIGVtYWlsJyxcbiAgICAgICAgZW1haWxCb2R5OiAnSGVsbG8ge3VzZXJuYW1lfSEgWW91ciB2ZXJpZmljYXRpb24gY29kZSBpcyB7IyMjI30nLFxuICAgICAgICBlbWFpbFN0eWxlOiBWZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VycG9vbFdlYkNsaWVudCA9IG5ldyBVc2VyUG9vbENsaWVudCh0aGlzLCAndXNlci1wb29sLWNsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGlkZW50aXR5UG9vbCA9IG5ldyBDZm5JZGVudGl0eVBvb2wodGhpcywgJ2lkZW50aXR5LXBvb2wnLCB7XG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNsaWVudElkOiB1c2VycG9vbFdlYkNsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgIHByb3ZpZGVyTmFtZTogXFxgY29nbml0by1pZHAuXFwke3RoaXMucmVnaW9ufS5hbWF6b25hd3MuY29tL1xcJHt0aGlzLnVzZXJQb29sLnVzZXJQb29sSWR9XFxgLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVuYXV0aFJvbGUgPSBuZXcgUm9sZSh0aGlzLCAndW5hdXRoLXJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBXZWJJZGVudGl0eVByaW5jaXBhbCgnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJylcbiAgICAgICAgLndpdGhDb25kaXRpb25zKHtcbiAgICAgICAgICAnU3RyaW5nRXF1YWxzJzogeyAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IFxcYFxcJHtpZGVudGl0eVBvb2wucmVmfVxcYCB9LFxuICAgICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzogeyAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICd1bmF1dGhlbnRpY2F0ZWQnIH0sXG4gICAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXV0aFJvbGUgPSBuZXcgUm9sZSh0aGlzLCAnYXV0aC1yb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgV2ViSWRlbnRpdHlQcmluY2lwYWwoJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScpXG4gICAgICAgIC53aXRoQ29uZGl0aW9ucyh7XG4gICAgICAgICAgJ1N0cmluZ0VxdWFscyc6IHsgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiBcXGBcXCR7aWRlbnRpdHlQb29sLnJlZn1cXGAgfSxcbiAgICAgICAgICAnRm9yQW55VmFsdWU6U3RyaW5nTGlrZSc6IHsgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphbXInOiAnYXV0aGVudGljYXRlZCcgfSxcbiAgICAgICAgfSksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFwcHN5bmNUcmFuc2Zvcm1lciA9IG5ldyBBcHBTeW5jVHJhbnNmb3JtZXIodGhpcywgJ2FwcHN5bmMtYXBpJywge1xuICAgICAgc2NoZW1hUGF0aDogJy4vc2NoZW1hLmdyYXBocWwnLFxuICAgICAgYXBpTmFtZTogJ215LWNvb2wtYXBpJyxcbiAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogQXV0aG9yaXphdGlvblR5cGUuVVNFUl9QT09MLFxuICAgICAgICAgIHVzZXJQb29sQ29uZmlnOiB7XG4gICAgICAgICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgICAgICAgIGFwcElkQ2xpZW50UmVnZXg6IHVzZXJwb29sV2ViQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgICBkZWZhdWx0QWN0aW9uOiBVc2VyUG9vbERlZmF1bHRBY3Rpb24uQUxMT1dcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuYXBwc3luY1RyYW5zZm9ybWVyLmdyYW50UHVibGljKHVuYXV0aFJvbGUpO1xuICAgIHRoaXMuYXBwc3luY1RyYW5zZm9ybWVyLmdyYW50UHJpdmF0ZShhdXRoUm9sZSk7XG4gIH1cbn1gXG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVNhbXBsZVNjaGVtYSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgIyBUaGlzIGlzIGEgc2FtcGxlIGdlbmVyYXRlZCBzY2hlbWFcbnR5cGUgQ3VzdG9tZXIgQG1vZGVsXG4gICAgQGF1dGgocnVsZXM6IFtcbiAgICAgICAgeyBhbGxvdzogZ3JvdXBzLCBncm91cHM6IFtcIkFkbWluc1wiXSB9LFxuICAgICAgICB7IGFsbG93OiBwcml2YXRlLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZCwgdXBkYXRlXSB9XG4gICAgXSkge1xuICAgICAgICBpZDogSUQhXG4gICAgICAgIGZpcnN0TmFtZTogU3RyaW5nIVxuICAgICAgICBsYXN0TmFtZTogU3RyaW5nIVxuICAgICAgICBhY3RpdmU6IEJvb2xlYW4hXG4gICAgICAgIGFkZHJlc3M6IFN0cmluZyFcbn1cblxudHlwZSBQcm9kdWN0IEBtb2RlbFxuICAgIEBhdXRoKHJ1bGVzOiBbXG4gICAgICAgIHsgYWxsb3c6IGdyb3VwcywgZ3JvdXBzOiBbXCJBZG1pbnNcIl0gfSxcbiAgICAgICAgeyBhbGxvdzogcHVibGljLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZF0gfVxuICAgIF0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBuYW1lOiBTdHJpbmchXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTdHJpbmchXG4gICAgICAgIHByaWNlOiBTdHJpbmchXG4gICAgICAgIGFjdGl2ZTogQm9vbGVhbiFcbiAgICAgICAgYWRkZWQ6IEFXU0RhdGVUaW1lIVxuICAgICAgICBvcmRlcnM6IFtPcmRlcl0gQGNvbm5lY3Rpb25cbn1cblxudHlwZSBPcmRlciBAbW9kZWxcbiAgICBAa2V5KGZpZWxkczogW1wiaWRcIiwgXCJwcm9kdWN0SURcIl0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBwcm9kdWN0SUQ6IElEIVxuICAgICAgICB0b3RhbDogU3RyaW5nIVxuICAgICAgICBvcmRlcmVkOiBBV1NEYXRlVGltZSFcbn1cblxuIyBEZW1vbnN0cmF0ZSB0aGUgRlVOQ1RJT04gcmVzb2x2ZXJzXG50eXBlIFVzZXIgQG1vZGVsKHF1ZXJpZXM6IG51bGwsIG11dGF0aW9uczogbnVsbCwgc3Vic2NyaXB0aW9uczogbnVsbClcbiAgICBAYXV0aChydWxlczogW1xuICAgICAgICB7IGFsbG93OiBncm91cHMsIGdyb3VwczogW1wiQWRtaW5zXCJdIH0sXG4gICAgICAgIHsgYWxsb3c6IG93bmVyLCBvd25lckZpZWxkOiBcInN1YlwiIH0sXG4gICAgICAgIHsgYWxsb3c6IHByaXZhdGUsIHByb3ZpZGVyOiBpYW0sIG9wZXJhdGlvbnM6IFtjcmVhdGUsIHVwZGF0ZV0gfVxuICAgIF0pIHtcbiAgICBpZDogSUQhXG4gICAgZW5hYmxlZDogQm9vbGVhbiFcbiAgICBzdGF0dXM6IFN0cmluZyFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBlbWFpbF92ZXJpZmllZDogU3RyaW5nXG4gICAgcGhvbmVfbnVtYmVyOiBTdHJpbmdcbiAgICBwaG9uZV9udW1iZXJfdmVyaWZpZWQ6IFN0cmluZ1xufVxuXG50eXBlIFVzZXJDb25uZWN0aW9uIHtcbiAgICBpdGVtczogW1VzZXJdXG59XG5cbmlucHV0IENyZWF0ZVVzZXJJbnB1dCB7XG4gICAgZW1haWw6IFN0cmluZyFcbiAgICBuYW1lOiBTdHJpbmchXG59XG5cbmlucHV0IFVwZGF0ZVVzZXJJbnB1dCB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmdcbiAgICBuYW1lOiBTdHJpbmdcbiAgICBudW1iZXI6IFN0cmluZ1xufVxuXG4jIERlbW9uc3RyYXRlIHRoZSBGVU5DVElPTiByZXNvbHZlcnNcbnR5cGUgUXVlcnkge1xuICBsaXN0VXNlcnM6IFVzZXJDb25uZWN0aW9uIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxuICBnZXRVc2VyKGlkOiBJRCEpOiBVc2VyIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxufVxuXG50eXBlIE11dGF0aW9uIHtcbiAgY3JlYXRlVXNlcihpbnB1dDogQ3JlYXRlVXNlcklucHV0ISk6IFVzZXIgQGZ1bmN0aW9uKG5hbWU6IFwicm91dGVyXCIpXG4gIHVwZGF0ZVVzZXIoaW5wdXQ6IFVwZGF0ZVVzZXJJbnB1dCEpOiBVc2VyIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxufWA7XG4gIH1cbn0iXX0=