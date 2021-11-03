import { name, commerce } from 'faker';
import { randomInt } from 'd3-random';
import { createWriteTransactionParams, dynamoDb } from '../../../utils/dynamo';
import { orderStatuses, pkValues } from '../../../utils/constants';

const { MAIN_TABLE_NAME } = process.env;

export const handler = createFakeOrders;

async function createFakeOrders() {
  try {
    const params = createWriteTransactionParams([
      MAIN_TABLE_NAME,
      buildNewOrder('SOME_CLIENT_ID_HERE'), // todo: get all clients and add an order per client
    ]);

    await dynamoDb.transactWrite(params);
  } catch (error) {
    console.info(error);
  }

  function buildNewOrder(clientId) {
    const items = createItems();
    const created = new Date().toISOString();
    const sk = `${created}#${clientId}`;
    const order = {
      firstName: name.firstName(),
      lastName: name.lastName(),
      items,
      clientId,
      total: items.reduce((acc, item) => acc + item.price, 0),
      pk: pkValues.order,
      sk,
      created,
      status: orderStatuses.open,
    };

    return order;

    function createItems() {
      const maxFive = randomInt(1, 5);
      const numItems = maxFive();
      const items = [];

      for (let i = 0; i < numItems; i++) {
        const quantity = maxFive();
        const unitPrice = randomInt(549, 99999)();
        const item = {
          name: commerce.productName(),
          description: commerce.productDescription(),
          quantity,
          price: quantity * unitPrice,
        };

        items.push(item);
      }

      return items;
    }
  }
}
