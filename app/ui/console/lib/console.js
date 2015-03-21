BlessedConst = new (require('./blessed-const'));

var blessed = require('blessed');
var events = require('events');
var util = require('util');


/**
 * @param config
 * @param service
 * @param api
 * @constructor
 */
var Console = function(config, service, api) {
	this._api = api;
	this._config = config;
	this._panels = {};
	this._widgets = {};
	this.player = service.player;
	this.playlist = service.playlist;
};
goog.inherits(Console, events.EventEmitter);


/**
 */
Console.prototype.init = function() {
	this._openPopUps = [];

	this.screen = blessed.screen({
//		grabKeys: true
	});
	this._api.vk.on('error', this._apiVKErrorHandler.bind(this));
	this._api.vk//todo move to app
		.getUserId()
		.then(function(userId) {
			this.userId = userId;
		}.bind(this));

	this._visiblePanels = {};
	this._history = [];
	this._authPopUp = null;

	this._widgets.input = this._createInput();
	this._widgets.loading = new vknp.ui.console.widgets.Loading;
	this._panels.slavePL = new vknp.ui.console.panels.SlavePL;
	this._panels.home = new vknp.ui.console.panels.Home();
	this._panels.vk = new vknp.ui.console.panels.VK;
	this._panels.news = new vknp.ui.console.panels.News;
	this._panels.mainPL = new vknp.ui.console.panels.MainPL;
	this._panels.friends = new vknp.ui.console.panels.Friends;
	this._widgets.playBar = new vknp.ui.console.widgets.PlayBar;
	this._widgets.infoBar = new vknp.ui.console.widgets.InfoBar;
	this._widgets.controls = new vknp.ui.console.widgets.Controls;
	this._panels.groups = new vknp.ui.console.panels.Groups;
	this._panels.albums = new vknp.ui.console.panels.Albums;

	this._visiblePanels.left = this._panels.home;
	this._visiblePanels.right = this._panels.mainPL;
	this.activePanel = this._visiblePanels.left;

	this.screen.key(['tab'], this.changeFocusPanel.bind(this));
	this.screen.on(BlessedConst.event.KEY_PRESS, function(ch, key) {
		if (key.name === BlessedConst.button.MOUSE) {
			return;
		}
		if (key.name === BlessedConst.button.SPACE && this.screen.focused !== this._widgets.input.getNode()) {
			this._widgets.input.getNode().focus();
		}
	}.bind(this));

	this._api.vk.on(this._api.vk.EVENT_START_REQUEST, this._widgets.loading.load.bind(this._widgets.loading));
	this._api.vk.on(this._api.vk.EVENT_STOP_REQUEST, this._widgets.loading.stop.bind(this._widgets.loading));

	if (this._authPopUp) {
		this._authPopUp.setIndex(-1);
	}

	this.render();
	this._widgets.input.getNode().focus();
};


/**
 */
Console.prototype.changeFocusPanel = function() {
	if (this.activePanel === this._visiblePanels.left) {
		this.show(this._visiblePanels.right);
	} else {
		this.show(this._visiblePanels.left);
	}
};


/**
 * @param {Object} panel
 */
Console.prototype.show = function(panel) {
	if (panel.isHidden()) {
		this._addToHistory(this.activePanel);
	}
	this._show(panel);
};


/**
 * @param {Object} panel
 */
Console.prototype._show = function(panel) {
	if (panel.isHidden()) {
		this._setTopPanel(panel);
	} else {
		this.activePanel = panel;
		if (panel !== this._panels.mainPL) {
			this._visiblePanels.left = panel;
		}
		panel.focus();
	}
};


/**
 * @param {Object} panel
 */
Console.prototype._setTopPanel = function(panel) {
	this.emit(this.EVENT_SET_TOP, panel, this._visiblePanels.left);
	this._visiblePanels.left.getNode().hide();
	this._visiblePanels.left = panel;
	this.activePanel = panel;
	panel.getNode().show();
	panel.getNode().focus();
	this.render();
};


/**
 */
Console.prototype._addToHistory = function(panel) {
	if (this._history.length > 10) {
		this._history.shift();
	}
	this._history.push(panel);
};


/**
 */
Console.prototype.back = function() {
	var panel = this._history.pop();
	this._show(panel);
};


/**
 * @param {string} cmd
 */
Console.prototype.exec = function(cmd) {
	var commandList = {//todo add clear
		exit: ['exit', 'quit', 'q'],
		forward: ['forward', 'fwd'],//todo not supported stupid-player
		help: ['help', 'h'],
		next: ['next'],
		pause: ['pause', 'p'],//todo not supported stupid-player
		play: ['play'],
		radio: ['radio', 'r'],
		reward: ['reward', 'rwd'],//todo not supported stupid-player
		prev: ['prev'],
		search: ['search', 's'],
		stop: ['stop']
	};

	if (cmd.indexOf('\n') > -1) {
		var position = cmd.indexOf('\n');
		cmd = cmd.substr(0, position);
	}
	var args = cmd.split(' ');
	var command = args.shift();

	args = args.join(' ');
	var currentCommand = this._searchCommand(commandList, command);

	switch (currentCommand) {
		case commandList.help:
			this.help();
			break;
		case commandList.play:
			app.play(this._panels.mainPL.getPlaylistId(), 300, args);
			break;
		case commandList.pause:
			app.pause();
			break;
		case commandList.stop:
			app.stop();
			break;
		case commandList.search:
			app.search(this._panels.mainPL.getPlaylistId(), 300, args);
			break;
		case commandList.next:
			app.next();
			break;
		case commandList.radio:
			app.radio(this._panels.mainPL.getPlaylistId(), 300, args);
			break;
		case commandList.exit:
			process.exit(0);
			break;
		default:
		//todo
	}
};


/**
 * @param {Object} commandList
 * @param {string} cmd
 * @return {string|undefined}
 * @private
 */
Console.prototype._searchCommand = function(commandList, cmd) {
	for(var i in commandList) {
		if(commandList.hasOwnProperty(i)) {
			for(var j = 0; j < commandList[i].length; j++) {
				if(cmd == commandList[i][j]) {
					return commandList[i];
				}
			}
		}
	}
};


/**
 */
Console.prototype.copy = function() {
	var activePanel = this.activePanel;
	var index = activePanel.getNode().selected;
	var item = activePanel.getChildData(index);
	var playlist = this._panels.mainPL.getPlaylist();

	if (activePanel === this._panels.slavePL && item) {
		playlist.addItems([new vknp.models.AudioTrack(item)]);
	}
	if (activePanel === this._panels.friends && this._panels.friends.getChild(index) && this._panels.friends.getChild(index).friend) {
		var friend = this._panels.friends.getChildData(index);
		this._api.vk
			.getAudio(friend.id, 300)
			.then(function(tracks) {
				playlist.addItems(tracks);
			});
	}
	if (activePanel === this._panels.albums && index === 1 && this._panels.albums.getChild(index)) {
		this._api.vk
			.getAudio(this._panels.albums.ownerId, 300)
			.then(function(tracks) {
				playlist.addItems(tracks);
			});
	}
	if (activePanel === this._panels.albums && this._panels.albums.getChild(index) && this._panels.albums.getChild(index).album) {
		var album = this._panels.albums.getChildData(index);
		this._api.vk
			.getAudio(album.ownerId, null, album.albumId)
			.then(function(tracks) {
				playlist.addItems(tracks);
			});
	}
	if (activePanel === this._panels.groups && this._panels.groups.getChild(index) && this._panels.groups.getChild(index).group) {
		var group = this._panels.groups.getChildData(index);
		this._api.vk
			.getAudio(group.id, 300)
			.then(function(tracks) {
				playlist.addItems(tracks);
			});
	}
};


/**
*/
Console.prototype.remove = function() {
	if (this.activePanel === this._panels.mainPL) {
		var index = this.activePanel.getNode().selected;
		var child = this.activePanel.getChild(index);
		if (child) {
			var track = this.activePanel.getChild(index).track;
			this.activePanel.getNode().remove(child);
			this.activePanel.playlist.removeItems(track.position, 1);
			this.activePanel.getNode().select(index);
		}
	}
};


/**
*/
Console.prototype.render = function() {
	this.screen.render();
};


/**
 * @param {Node} node
 */
Console.prototype.append = function(node) {
	this.screen.append(node);
};


/**
 * @param {vknp.ui.console.popups} PopUp
 */
Console.prototype.openPopUp = function(PopUp, opt_params) {
	var popup = new PopUp(opt_params);

	this._openPopUps.push(popup);
	popup.on('close', function() {
		this._openPopUps.pop();
		if (this._openPopUps.length) {
			this._openPopUps[this._openPopUps.length - 1].focus();
			this.render();
		}
	}.bind(this));

	popup.focus();
	return popup;
};


/**
 * @return {Input}
 * @private
 */
Console.prototype._createInput = function() {
	var input = new vknp.ui.console.widgets.Input({
		'bottom': 3,
		'left': 'center',
		'width': '99%',
		'height': 1,
		'style': {
			'fg': 'white',
			'bg': 'blue'
		}
	});

	return input;
};


/**
 * @private
 */
Console.prototype._apiVKErrorHandler = function(errorCode, errorMessage) {
	var closeAuthPopUp = function() {
		this._authPopUp.removeListener('close', closeAuthPopUp);
		this._authPopUp = null;
	}.bind(this);

	if (errorCode === 5 && !this._authPopUp) {
		this._authPopUp = this.openPopUp(vknp.ui.console.popups.Authorization);
		//this._authPopUp.setIndex(-1);
		this._authPopUp.on('close', closeAuthPopUp);
		setTimeout(this._authPopUp.focus.bind(this._authPopUp), 2000);//dirty hack for set focused
	}
};


/**
 * @type {vknp.service.Player}
 */
Console.prototype.player;


/**
 * @typedef {{
 *      left: Object.<*>, dynamic
 *      right: Object.<*> static panel playlist only
 * }}
 */
Console.prototype._visiblePanels;


/**
 */
Console.prototype.activePanel;


/**
 * @type {Screen}
 */
Console.prototype.screen;


/**
 * @type {number}
 */
Console.prototype.userId;//todo move to global scope


/**
 * @type {vknp.ui.console.popups.Authorization}
 */
Console.prototype._authPopUp;


/**
 * @type {Array.<vknp.ui.console.popups>}
 */
Console.prototype._openPopUps;


/**
 * @type {{
 *	    albums: console.panels.Albums,
 *	    friends: console.panels.Friends,
 *	    groups: console.panels.Groups,
 *	    home: console.panels.Home,
 *	    mainPL: console.panels.MainPL,
 *	    news: console.panels.News,
 *      slavePL: console.panels.SlavePL,
 *	    vk: console.panels.VK
 * }}
 */
Console.prototype._panels;


/**
 * @type {{
 *      controls: console.widgets.Controls,
 *	    infoBar: console.widgets.InfoBar,
 *	    input: console.widgets.Input,
 *	    loading: console.widgets.Loading,
 *	    playBar: console.widgets.PlayBar
 * }}
 */
Console.prototype._widgets;


/**
 * @const {string}
 */
Console.prototype.EVENT_SET_TOP  = 'set-top';


module.exports = Console;