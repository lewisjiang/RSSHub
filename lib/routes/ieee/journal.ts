import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import path from 'node:path';
import { art } from '@/utils/render';
import { parseDate } from '@/utils/parse-date'; // Tool function for parsing dates

import { CookieJar } from 'tough-cookie';
const cookieJar = new CookieJar();

export const route: Route = {
    path: ['/:journal/latest/vol/:sortType?', '/journal/:journal/:sortType?'],
    name: 'Unknown',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const punumber = ctx.req.param('journal');
    const sortType = ctx.req.param('sortType') ?? 'vol-only-seq';
    const host = 'https://ieeexplore.ieee.org';
    const jrnlUrl = `${host}/xpl/mostRecentIssue.jsp?punumber=${punumber}`;

    const response = await got(`${host}/rest/publication/home/metadata?pubid=${punumber}`, {
        cookieJar,
    }).json();
    const volume = response.currentIssue.volume;
    const isnumber = response.currentIssue.issueNumber;
    const jrnlName = response.displayTitle;

    const response2 = await got
        .post(`${host}/rest/search/pub/${punumber}/issue/${isnumber}/toc`, {
            cookieJar,
            json: {
                punumber,
                isnumber,
                sortType,
                rowsPerPage: '100',
            },
        })
        .json();
    let list = response2.records.map((item) => {
        const $2 = load(item.articleTitle);
        const title = $2.text();
        const link = item.htmlLink;
        const doi = item.doi;
        let authors = 'Do not have author';
        if (Object.hasOwn(item, 'authors')) {
            authors = item.authors.map((itemAuth) => itemAuth.preferredName).join('; ');
        }
        let abstract = '';
        Object.hasOwn(item, 'abstract') ? (abstract = item.abstract) : (abstract = '');
        return {
            title,
            link,
            authors,
            doi,
            volume,
            abstract,
        };
    });

    const renderDesc = (item) =>
        art(path.join(__dirname, 'templates/description.art'), {
            item,
        });
    list = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                if (item.abstract !== '') {
                    const response3 = await got(`${host}${item.link}`);
                    const { abstract, displayPublicationDate } = JSON.parse(response3.body.match(/metadata=(.*);/)[1]);
                    const $3 = load(abstract);
                    const $4 = load(displayPublicationDate);
                    item.abstract = $3.text();
                    item.description = renderDesc(item);
                    item.pubDate = parseDate($4.text()); // Ignore pubDate unless with abstract.
                }
                return item;
            })
        )
    );

    return {
        title: jrnlName,
        link: jrnlUrl,
        item: list,
    };
}
