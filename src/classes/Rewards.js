/**
 * Rewards Class
 *
 * Ghostery Browser Extension
 * https://www.ghostery.com/
 *
 * Copyright 2018 Ghostery, Inc. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0
 */

/* eslint consistent-return: 0 */

import cliqz from './Cliqz';
import conf from './Conf';
import tabInfo from './TabInfo';
import Policy from './Policy';
import globals from './Globals';
import { log } from '../utils/common';
import { sendMessage, injectScript } from '../utils/utils';
import * as accounts from '../utils/accounts';

const t = chrome.i18n.getMessage;
/**
 * Class for handling Ghostery Rewards Box overlay.
 * @memberOf  BackgroundClasses
 * @todo  make it a Singelton
 */
class Rewards {
	constructor() {
		this.storedOffers = {};
		this.unreadOfferIds = [];
		this.currentOffer = null;
		this.ports = new Map();
		this.channelsSupported = (typeof chrome.runtime.onConnect === 'object');
	}

	deleteReward(offerId) {
		this.markRewardRead(offerId);
		delete this.storedOffers[offerId];
		// @TODO send signal?
	}

	markRewardRead(offerId) {
		const rewardIdx = this.unreadOfferIds.indexOf(offerId);
		this.unreadOfferIds.splice(rewardIdx, 1);
	}

	sendSignal(message) {
		const { offerId, actionId } = message;

		if (actionId === 'offer_shown') {
			this.markRewardRead(offerId);
		}

		const signal = {
			origin: 'ghostery',
			type: 'action-signal',
			data: {
				action_id: actionId,
				offer_id: offerId
			}
		};
		cliqz.modules['offers-v2'].background.actions.processRealEstateMessage(signal);
	}

	showHotDog(tab_id, offer) {
		this.currentOffer = offer;
		const tab = tabInfo.getTabInfo(tab_id);

		// If the tab is prefetched, we can't add purplebox to it.
		if (!conf.enable_offers ||
			!tab || tab.rewards) {
			return Promise.resolve(false);
		}

		// Inject script cannot handle errors properly, but we call createBox after verifying that the tab is OK
		// So update hotdog status for this tab
		// tabInfo.setTabInfo(tab_id, 'rewards', true);
		if (this.channelsSupported) {
			if (this.ports.has(tab_id)) {
				this.ports.get(tab_id).disconnect();
				this.ports.delete(tab_id);
			}
			if (!this.connectListenerAdded) {
				this.connectListenerAdded = true;
				chrome.runtime.onConnect.addListener((port) => {
					if (port && port.name === 'rewardsPort' && port.sender && port.sender.tab && port.sender.tab.id) {
						const tabId = port.sender.tab.id;
						if (!this.ports.has(tabId)) {
							this.ports.set(tabId, port);
							this.ports.get(tabId).onMessage.addListener((message) => {
								switch (message.name) {
									case 'rewardsLoaded':
										this.ports.get(tabId).postMessage({
											name: 'showHotDog',
											reward: this.currentOffer,
											conf: {
												rewardsPromptAccepted: conf.rewards_accepted
											}
										});
										break;
									case 'rewardSignal':
										this.sendSignal(message.message);
										break;
									case 'rewardsDisabled':
										conf.enable_offers = false;
										break;
									case 'rewardsPromptAccepted':
										// @TODO set conf disabled
										conf.rewards_accepted = true;
										break;
									default:
										break;
								}
							});
						}
					}
				});
			}
		}

		return injectScript(tab_id, 'dist/rewards.js', 'dist/css/rewards_styles.css', 'document_start').catch((err) => {
			log('rewards injectScript error', err);
			return false;
		});
	}
}

export default new Rewards();