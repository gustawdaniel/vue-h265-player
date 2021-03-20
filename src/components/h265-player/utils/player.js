import WasmPlayer from '@easydarwin/easywasmplayer/EasyWasmPlayer.js';
import Emittery from 'emittery';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { logger } from './logger';
/**
 * 获取一个随机的 元素id,用作播放器的元素id
 */
export const getRandomElemId = () => {
    return uuidv4();
};
export var H265PlayerConstants;
(function (H265PlayerConstants) {
    H265PlayerConstants["on_play"] = "on_play";
    H265PlayerConstants["on_stop"] = "on_stop";
    H265PlayerConstants["on_endLoading"] = "on_endLoading";
    H265PlayerConstants["on_pause"] = "on_pause";
    H265PlayerConstants["on_resume"] = "on_resume";
    H265PlayerConstants["on_dispose"] = "on_dispose";
    H265PlayerConstants["on_error"] = "on_error";
    H265PlayerConstants["on_player_cb"] = "on_player_cb";
})(H265PlayerConstants || (H265PlayerConstants = {}));
export class H265Player extends Emittery {
    /**
     * @param elemId 播放器元素id
     * @param maxRetryCount 最大尝试重连次数
     */
    constructor(elemId, maxRetryCount = 3) {
        super();
        this.timer = 0;
        this.currentUrl = '';
        this.elemId = elemId;
        this.maxRetryCount = maxRetryCount <= 0 ? 3 : maxRetryCount;
        this.retryCount = this.maxRetryCount;
        this.init();
    }
    init() {
        if (this.player) {
            this.dispose();
        }
        logger.verbose('init player ~');
        this.player = new WasmPlayer(null, this.elemId, this.playerCbFunc.bind(this), {
            Height: true,
            HideKbs: true
        });
    }
    play(url) {
        var _a;
        if (!url) {
            logger.fatal('url is not valid');
            this.dispose();
            return;
        }
        logger.ok('start to play ~');
        // eslint-disable-next-line no-unused-expressions
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.play(url, 1);
        this.currentUrl = url;
        this.startUrlHeartBeat();
    }
    pause() {
        var _a;
        logger.warn('player pause');
        this.emit(H265PlayerConstants.on_pause);
        // eslint-disable-next-line no-unused-expressions
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.destroy();
        this.player = null;
        this.stopUrlHeartBeat();
    }
    resume() {
        logger.info('player resume');
        this.emit(H265PlayerConstants.on_resume);
        this.init();
        this.play(this.currentUrl);
    }
    playerCbFunc(type) {
        logger.info('player cb function：', type);
        this.emit(H265PlayerConstants.on_player_cb, type);
        switch (type) {
            case 'play':
                this.emit(H265PlayerConstants.on_play);
                this.player.endLoading();
                break;
            case 'stop':
                this.emit(H265PlayerConstants.on_stop);
                break;
            case 'endLoading':
                this.emit(H265PlayerConstants.on_endLoading);
                break;
            case 'pause':
                this.emit(H265PlayerConstants.on_pause);
                break;
            default:
                break;
        }
    }
    changeUrl(newUrl) {
        logger.info('change url');
        this.dispose();
        this.init();
        this.play(newUrl);
    }
    dispose() {
        var _a;
        logger.warn('dispose player');
        this.stopUrlHeartBeat();
        // eslint-disable-next-line no-unused-expressions
        (_a = this.player) === null || _a === void 0 ? void 0 : _a.destroy();
        this.player = null;
        this.currentUrl = '';
        this.retryCount = this.maxRetryCount;
        this.emit(H265PlayerConstants.on_dispose);
    }
    stopUrlHeartBeat() {
        logger.warn('stop url alive heartbeat');
        if (this.timer) {
            window.clearTimeout(this.timer);
        }
    }
    startUrlHeartBeat() {
        this.stopUrlHeartBeat();
        const url = this.currentUrl;
        if (!url) {
            logger.fatal('start url heart beat failed , because of url is not ok, url is:', url);
            return;
        }
        const HEART_BEAT_TIMEOUT = 6 * 1000; // 每隔多少秒进行一次心跳检测
        logger.verbose(`start url alive heartbeat, every ${HEART_BEAT_TIMEOUT} seconds`);
        checkUrlIsValid(url)
            .then(() => {
            logger.ok('url heartbeat ok, prepare for next heartbeat ~');
            // 如果正常，开始下一次检测
            this.timer = window.setTimeout(() => {
                this.startUrlHeartBeat();
            }, HEART_BEAT_TIMEOUT);
        })
            .catch((e) => {
            if (e.status === 501) {
                logger.fatal(e.statusText);
                this.dispose();
                return;
            }
            this.retryCount--;
            logger.fatal('url heartbeat failed with', e);
            if (this.retryCount <= 0) {
                logger.warn('reach max retry count, will dispose player ');
                this.emit(H265PlayerConstants.on_error, e);
                this.dispose();
            }
            else {
                logger.info('left retry count is: ', `${this.retryCount} / ${this.maxRetryCount} (left / total)`);
                logger.info('retry heartbeat ...');
                this.timer = window.setTimeout(() => {
                    this.startUrlHeartBeat();
                }, HEART_BEAT_TIMEOUT);
            }
        });
    }
}
/**
 * 检测一个 URL 是否能够正常访问
 * @param url 要测试的 url
 * @param timeout 超时时间
 * @returns 是否能够正常访问
 */
const checkUrlIsValid = (url, timeout = 5 * 1000) => {
    return new Promise((resolve, reject) => {
        if (!isValidURL(url) && !url.includes('m3u8')) {
            // eslint-disable-next-line prefer-promise-reject-errors
            return reject({
                status: 501,
                statusText: 'url is not valid'
            });
        }
        axios
            .get(`${url}&__time=${Date.now()}`, {
            responseType: 'blob',
            timeout
        })
            .then(resolve)
            .catch(e => {
            if (e.response) {
                const { status, statusText } = e.response || {};
                // eslint-disable-next-line prefer-promise-reject-errors
                reject({ status, statusText });
            }
            else {
                // eslint-disable-next-line prefer-promise-reject-errors
                reject({
                    status: 500,
                    statusText: (e === null || e === void 0 ? void 0 : e.message) || 'network error'
                });
            }
        });
    });
};
/**
 * 检查一个url是否合法
 * @param url 待检查的 url
 * @returns 是否合法
 */
export const isValidURL = (url) => {
    const res = url.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g);
    return res !== null;
};
