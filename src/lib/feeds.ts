export type Market = "jp" | "us";

export interface FeedSource {
  name: string;
  url: string;
  market: Market;
  isGoogleNews?: boolean;
}

export const FEEDS: FeedSource[] = [
  {
    name: "Yahoo!ニュース",
    url: "https://news.yahoo.co.jp/rss/topics/business.xml",
    market: "jp",
  },
  {
    name: "Google ニュース",
    url: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC%E6%A0%AA%E5%BC%8F%E5%B8%82%E5%A0%B4%20OR%20%E6%9D%B1%E8%A8%BC&hl=ja&gl=JP&ceid=JP:ja",
    market: "jp",
    isGoogleNews: true,
  },
  {
    name: "Yahoo Finance",
    url: "https://finance.yahoo.com/news/rssindex",
    market: "us",
  },
  {
    name: "MarketWatch",
    url: "http://feeds.marketwatch.com/marketwatch/topstories/",
    market: "us",
  },
  {
    name: "CNBC",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    market: "us",
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=stock%20market%20OR%20Wall%20Street&hl=en-US&gl=US&ceid=US:en",
    market: "us",
    isGoogleNews: true,
  },
];
