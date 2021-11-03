import { nanoid } from 'nanoid';
import { eventBridge } from '../../../utils/eventBridge';
import { createWriteTransactionParams, dynamoDb } from '../../../utils/dynamo';
import { pkValues } from '../../../utils/constants';
import { apiResponse, HttpError } from '../../../utils/http';
import { commonMiddleware } from '../../../utils/middleware';
import { signClientJwt } from '../../../utils/jwt';

const { MAIN_TABLE_NAME, JOB_SERVICE_NAME } = process.env;

export const handler = commonMiddleware(handleCreateClient);

async function handleCreateClient(event) {
  try {
    const client = buildClient();
    const params = createWriteTransactionParams([MAIN_TABLE_NAME, client]);

    await dynamoDb.transactWrite(params);

    const fakeOrderRule = await findFakeOrderRule();

    if (fakeOrderRule) {
      const isDisabled = fakeOrderRule.State === 'DISABLED';

      if (isDisabled) {
        await eventBridge.enableRule({
          Name: fakeOrderRule.Name,
          EventBusName: 'default',
        });
      }
    }

    const jwt = await signClientJwt(client);

    return apiResponse({ body: { clientToken: jwt }, cors: true });
  } catch (error) {
    console.info(error);

    if (error instanceof HttpError)
      return apiResponse({ ...error, cors: true });

    return apiResponse({
      statusCode: 500,
      cors: true,
    });
  }

  function buildClient() {
    const created = new Date().toISOString();
    const clientId = nanoid(8);
    const sk = `${created}#${clientId}`;
    const pk = pkValues.client;

    return { pk, sk, created, clientId };
  }
}

async function findFakeOrderRule() {
  const params = {
    EventBusName: 'default',
    NamePrefix: JOB_SERVICE_NAME,
  };
  const { Rules: rules } = await eventBridge.listRules(params);

  return rules.find((rule) => /CreateFakeOrders/i.test(rule?.Name));
}

// {
//   "Rules": [
//       {
//           "Name": "rardash-jobs-dev-CreateFakeOrdersEventsRuleSchedul-17QK9YWVGV6XU",
//           "Arn": "arn:aws:events:us-east-1:967597777336:rule/rardash-jobs-dev-CreateFakeOrdersEventsRuleSchedul-17QK9YWVGV6XU",
//           "State": "DISABLED",
//           "ScheduleExpression": "rate(1 minute)",
//           "EventBusName": "default"
//       }
//   ]
// }
