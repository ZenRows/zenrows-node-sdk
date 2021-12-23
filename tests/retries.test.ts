import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { ZenRows } from '../src';

describe('ZenRows Client with Retries', () => {
    const apiKey = 'API_KEY';
    const url = 'https://zenrows.com';
    const client = new ZenRows(apiKey, { retries: 2 });

    test('should call axios 3 times (initial plus two retries)', async () => {
        const mock = new MockAdapter(axios);
        mock.onGet().reply(500);

        try {
            await client.get(url);
        } catch (error) {
            expect(mock.history.get.length).toBe(3);
            return;
        }

        expect('should not arrive here').toBe(true);
    });

    test('should throw error with status code 500', async () => {
        const mock = new MockAdapter(axios);
        mock.onGet().reply(500);

        try {
            await client.get(url);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                expect(error.response?.status).toBe(500);
                expect(mock.history.get.length).toBe(3);
                return;
            }
        }

        expect('should not arrive here').toBe(true);
    });

    test('should fail the first attempt and succeed the second', async () => {
        const mock = new MockAdapter(axios);
        mock.onGet().replyOnce(500).onGet().reply(200);

        const response = await client.get(url);

        expect(response.status).toBe(200);
        expect(mock.history.get.length).toBe(2);
    });
});
