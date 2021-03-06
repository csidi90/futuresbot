const dotenv = require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const app = express();
const DEBUG = process.env.DEBUG;
const _ = require('lodash');
const Binance = require('binance-api-node').default;
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const MAX_TRADES = process.env.MAX_TRADES;
const POSITION_SIZE = process.env.DEFAULT_TRADE_SIZE;
const DEFAULT_LEVERAGE = process.env.DEFAULT_LEVERAGE;
const DEFAULT_SL_PERCENTRAGE = process.env.DEFAULT_SL_PERCENTRAGE;
const SYMBOL = process.env.SYMBOL;
const INTERVAL = process.env.INTERVAL;
const talib = require('talib-binding');
let cache = [];
let orders = [];
const client = Binance({
	apiKey    : API_KEY,
	apiSecret : API_SECRET
});

const Binance2 = require('node-binance-api');
const { OrderRejectReason } = require('binance-api-node');
const { runInContext } = require('lodash');
const client2 = new Binance2().options({
	APIKEY    : API_KEY,
	APISECRET : API_SECRET
});

app.set('json spaces', 2);
app.use(cors());
app.use(bodyParser.json());
app.get('/', async (req, res) => {
	res.json({ SYMBOL, INTERVAL, PORT, DEFAULT_LEVERAGE, DEFAULT_SL_PERCENTRAGE, POSITION_SIZE });
});
app.get('/orders', async (req, res) => {
	res.status(200).json(orders);
});
app.get('/cache', async (req, res) => {
	res.status(200).json(cache);
});
app.listen(PORT, async () => {
	console.log(`server starting on port ${PORT}`);
	start();
});
//start up application
async function start() {
	console.log(`bot started for symbol ${SYMBOL} using interval ${INTERVAL}`);
	await generateCache();
	checkSignals();
	startStreaming();
}

//generate cache data for candlesticks (500)
async function generateCache() {
	console.log('generating cache..');
	cache = await client.futuresCandles({
		symbol   : SYMBOL,
		interval : INTERVAL
	});
}

//start streaming realtime and check for signals
function startStreaming() {
	console.log('start streaming data..');
	client.ws.candles(SYMBOL, INTERVAL, (candle) => {
		let last = _.last(cache);

		if (last.openTime != candle.startTime) {
			cache.push({
				openTime         : candle.startTime,
				open             : candle.open,
				high             : candle.high,
				low              : candle.low,
				close            : candle.close,
				volume           : candle.volume,
				closeTime        : candle.closeTime,
				quoteVolume      : candle.quoteVolume,
				trades           : candle.trades,
				baseAssetVolume  : candle.buyVolume,
				quoteAssetVolume : candle.quoteVolume
			});
			//check buy / sell signals on new opened candle
			checkSignals();
			console.log('new candle added size: ' + cache.length);
		} else {
			last.open = candle.open;
			last.high = candle.high;
			last.low = candle.low;
			last.close = candle.close;
			last.volume = candle.volume;
			last.closeTime = candle.closeTime;
			last.quoteVolume = candle.quoteVolume;
			last.trades = candle.trades;
			last.baseAssetVolume = candle.buyVolume;
			last.quoteAssetVolume = candle.quoteVolume;
		}
	});
}

//if EMA 9 (close) crosses up EMA 9 (open)
function shouldBuy() {
	let ema9_close = talib.EMA(candleData('close'), 9, talib.MATypes.EMA);
	let ema9_open = talib.EMA(candleData('open'), 9, talib.MATypes.EMA);
	let ema_close = _.last(ema9_close);
	let ema_open = _.last(ema9_open);
	let ema_close_prev = ema9_close[ema9_close.length - 2];
	let ema_open_prev = ema9_open[ema9_open.length - 2];

	if (ema_close > ema_open && ema_close_prev <= ema_open_prev) {
		return true;
	}

	return false;
}

//if EMA 9 (close) crosses down EMA 9 (open)
function shouldSell() {
	let ema9_close = talib.EMA(candleData('close'), 9, talib.MATypes.EMA);
	let ema9_open = talib.EMA(candleData('open'), 9, talib.MATypes.EMA);
	let ema_close = _.last(ema9_close);
	let ema_open = _.last(ema9_open);
	let ema_close_prev = ema9_close[ema9_close.length - 2];
	let ema_open_prev = ema9_open[ema9_open.length - 2];

	if (ema_close < ema_open && ema_close_prev >= ema_open_prev) {
		return true;
	}

	return false;
}

function checkSignals() {
	console.log('checking signals..');
	if (shouldBuy()) {
		buy();
		console.log(new Date() + ' SHOULD BUY');
	}
	if (shouldSell()) {
		sell();
		console.log(new Date() + ' SHOULD SELL');
	}
}
function lastCandle() {
	return _.last(cache);
}

function candleData(key) {
	return _.map(cache, key);
}

async function buy() {
	let response = await client2.futuresMarketBuy(SYMBOL, POSITION_SIZE, { newOrderRespType: 'RESULT' });
	orders.push(response);
}

async function sell() {
	let response = await client2.futuresMarketSell(SYMBOL, POSITION_SIZE, { newOrderRespType: 'RESULT' });
	orders.push(response);
}
