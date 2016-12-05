var messageList = {
	config: [],
	ignoredUsers: [],
	autoscrolling: false,
	imagemapDebouncer: '',
	menuDebouncer: '',
	zoomLevel: 1,
	ignorated: {
		total_ignored: 0,
		data: {
			users: {}
		}
	},
	pm: '',
	
	
	/**
	 *  Do some initialisation before DOMContentLoaded fires.
	 */
	
	init: function(config) {
		this.config = config.data;
		this.config.tcs = config.tcs;		
		this.prepareIgnoratorArray();
		
		// set up globalPort so we can interact with background page
		this.globalPort = chrome.runtime.connect();
		this.globalPort.onMessage.addListener(this.handleEvent.onReceiveMessage);
		
		if (this.config.reload_on_update) {
			this.globalPort.onDisconnect.addListener(this.handleEvent.onPortDisconnect);
		}
		
		if (window.location.pathname === '/inboxthread.php') {
			this.pm = "_pm";
		}
		
		// check whether we need to display dramalinks ticker
		if (this.config.dramalinks && !this.pm) {
			
			this.sendMessage({ need: "dramalinks" }, (response) => {
				dramalinks.html = response.data;					
				dramalinks.config = messageList.config;				
			});
		}
		
		this.getZoomLevel();
		
		if (document.readyState == 'loading') {
			// wait for DOMContentLoaded to fire before attempting to modify DOM
			document.addEventListener('DOMContentLoaded', () => {
				messageList.applyDomModifications.call(messageList, messageList.pm);
			});
		}
		else {
			this.applyDomModifications.call(this, this.pm);
		}
	},
	
	
	/**
	 *  Methods which modify DOM
	 */
	
	dom: {
		messagecontainer: {
			ignorator_messagelist: function(msg) {
				if (!messageList.config.ignorator) {
					// User enabled ignorator, but didn't populate list with usernames
					return;
				}
				
				var tops = msg.getElementsByClassName('message-top');
					
				// Note: don't cache length property, it will break
				for (var j = 0; j < tops.length; j++) {
					var top = tops[j];
									
					var username = top.getElementsByTagName('a')[0].innerHTML.toLowerCase();
					
					for (var f = 0, len = messageList.ignoredUsers.length; f < len; f++) {
						var ignoredUser = messageList.ignoredUsers[f];
						
						if (username == ignoredUser.toLowerCase()) {
							
							top.parentNode.classList.add('ignorated');
							
							messageList.ignorated.total_ignored++;
							
							// Keep track of any users that have been ignored (and the number of posts they made)
							if (!messageList.ignorated.data.users[ignoredUser]) {
								messageList.ignorated.data.users[ignoredUser] = {};
								messageList.ignorated.data.users[ignoredUser].total = 1;
							} 
							
							else {
								messageList.ignorated.data.users[ignoredUser].total++;
							}
							
							if (!messageList.config.hide_ignorator_badge) {
								messageList.globalPort.postMessage({
									action: 'ignorator_update',
									ignorator: messageList.ignorated,
									scope: "messageList"
								});
							}
						}
					}
				}
			},
			
			user_notes: function(msg, top) {			
				// Unlikely, but still possible that usernote_notes hasn't been populated
				if (!messageList.config.usernote_notes) {
					messageList.config.usernote_notes = {};
				}	
								
				// Anon topic - ignore
				if (!/user=(\d+)$/i.test(top.getElementsByTagName('a')[0].href)) {
					return;
				}
				
				var notebook = document.createElement('a');	
				notebook.id = 'notebook';
				
				var userId = top.getElementsByTagName('a')[0].href.match(/user=(\d+)$/i)[1];
				
				notebook.innerHTML = (messageList.config.usernote_notes[userId] != undefined 
						&& messageList.config.usernote_notes[userId] != '')
								? 'Notes*' : 'Notes';
								
				notebook.href = "##note" + userId;
				
								
				top.appendChild(document.createTextNode(' | '));
				top.appendChild(notebook);
			},
			
			like_button: function(msg, top, index) {											
				var anchor = document.createElement('a');
				var divider = document.createTextNode(" | ");
				anchor.innerHTML = 'Like';
				anchor.className = 'like_button';
				anchor.href = '##like';
				top.appendChild(divider);
				top.appendChild(anchor);
				anchor.addEventListener('mouseenter', messageList.handleEvent.mouseenter.bind(messageList));
				anchor.addEventListener('mouseleave', messageList.handleEvent.mouseleave.bind(messageList));				
			},
			
			number_posts: function(msg, top, index) {
				var page;
				
				if (!window.location.href.match(/page=/)) {
					page = 1;
				}
				
				else {
					page = window.location.href.match(/page=(\d+)/)[1];
				}
				
				var id = (index + (50 * (page - 1)));
				
				// Pad id with zeros so we always have a 4 digit number (0001, 0010, etc)
				if (id < 1000)
					id = "0" + id;
				if (id < 100)
					id = "0" + id;
				if (id < 10)
					id = "0" + id;
				
				var postNumber = document.createTextNode(' | #' + id);
				top.appendChild(postNumber);
			},
			
			post_templates: function(msg, top, index) {
				var cDiv = document.createElement('div');
				cDiv.style.display = 'none';
				cDiv.id = 'cdiv';
				document.body.appendChild(cDiv, null);
				messageList.postEvent = document.createEvent('Event');
				messageList.postEvent.initEvent('postTemplateInsert', true, true);
				var sep = document.createElement('span');
				sep.innerHTML = " | ";
				sep.className = "post_template_holder";
				var sepIns = document.createElement('span');
				sepIns.className = 'post_template_opts';
				sepIns.innerHTML = '[';
				var qr = document.createElement('a');
				qr.href = "##" + index;
				qr.innerHTML = "&gt;"
				qr.className = "expand_post_template";
				sepIns.appendChild(qr);
				sepIns.innerHTML += ']';
				sep.appendChild(sepIns);
				top.appendChild(sep);
			},
			
			userhl_messagelist: function(msg, firstTop, index, live) {
				if (!messageList.config.enable_user_highlight) {
					return;
				}
				
				var tops = msg.getElementsByClassName('message-top');
				
				if (!messageList.config.no_user_highlight_quotes) {
					
					// Note: don't cache length property, it will break
					for (var k = 0; k < tops.length; k++) {
						var top = tops[k];			
						var user = top.getElementsByTagName('a')[0].innerHTML.toLowerCase();
						
						if (messageList.config.user_highlight_data[user]) {
							
							top.setAttribute('highlighted', true);								
							top.style.background = '#' + messageList.config.user_highlight_data[user].bg;
							top.style.color = '#' + messageList.config.user_highlight_data[user].color;
									
							var anchors = top.getElementsByTagName('a');
							
							for (var j = 0, len = anchors.length; j < len; j++) {
								var anchor = anchors[j];
								anchor.style.color = '#' + messageList.config.user_highlight_data[user].color;
							}
							
							if (live && messageList.config.notify_userhl_post && k === 0
									&& top.getElementsByTagName('a')[0].href.match(/user=(\d+)$/i)[1] != messageList.config.user_id) {
								
								messageList.sendMessage({
									need: "notify",
									title: "Post by " + top.getElementsByTagName('a')[0].innerHTML,
									message: document.title.replace(/End of the Internet - /i, '')									
								});
								
							}					
						}
					}				
				}
				
				else {
					user = firstTop.getElementsByTagName('a')[0].innerHTML.toLowerCase();
							
					if (messageList.config.user_highlight_data[user]) {
						
						firstTop.style.background = '#'
								+ messageList.config.user_highlight_data[user].bg;
						firstTop.style.color = '#'
								+ messageList.config.user_highlight_data[user].color;
								
						anchors = firstTop.getElementsByTagName('a');
						
						for (var j = 0, len = anchors.length; j < len; j++) {
							anchor = anchors[j];
							anchor.style.color = '#'
									+ messageList.config.user_highlight_data[user].color;
						}
						
						if (live && messageList.config.notify_userhl_post
								&& top.getElementsByTagName('a')[0].href.match(/user=(\d+)$/i)[0] != messageList.config.user_id) {
							
							messageList.sendMessage({
								need: "notify",
								title: "Post by " + user,
								message: document.title.replace(/End of the Internet - /i, '')
							});
						}				
					}
				}
			},
			
			foxlinks_quotes: function(msg) {
				var color = "#" + messageList.config['foxlinks_quotes_color'];
				var quotes = msg.getElementsByClassName('quoted-message');
				
				if (!quotes) {
					return;
				}

				for (var i = 0, len = quotes.length; i < len; i++) {
					var quote = quotes[i];
					quot_msg_style = quote.style;
					quot_msg_style.borderStyle = 'solid';
					quot_msg_style.borderWidth = '2px';
					quot_msg_style.borderRadius = '5px';
					quot_msg_style.marginRight = '30px';
					quot_msg_style.marginLeft = '10px';
					quot_msg_style.paddingBottom = '10px';
					quot_msg_style.marginTop = '0px';
					quot_msg_style.borderColor = color;
					
					var top = quote.getElementsByClassName('message-top')[0];
					
					if (top) {
						if (top.style.background == '') {
							top.style.background = color;
						} else {
							quot_msg_style.borderColor = top.style.background;
						}
						top.style.marginTop = '0px';
						top.style.paddingBottom = '2px';
						top.style.marginLeft = '-6px';
					}
				}
			},
			
			label_self_anon: function(msg) {
				var tagList = document.getElementsByTagName('h2')[0];
				if (tagList.innerHTML.indexOf('href="/topics/Anonymous"') > -1) {
					// We can only get human number from topics that we can post in
					var quickpostBody = document.getElementsByClassName('quickpost-body')[0];
					
					if (quickpostBody) {					
						var tops = msg.getElementsByClassName('message-top');
						var userRegex = /user=(\d+)$/;
						
						if (!userRegex.test(tops[0].getElementsByTagName('a')[0])) {	
							var self = quickpostBody.getElementsByTagName('a')[0].innerHTML;
							
							if (self.indexOf('Human #') == -1) {
								// User hasn't posted in topic yet
								return;
							}
							
							else {
								for (var i = 0, len = tops.length; i < len; i++) {
									var top = tops[i];
									var element = top.getElementsByTagName('a')[0];
									
									if (element.innerHTML.indexOf('Filter') > -1) {
										element = top.getElementsByTagName('b')[0].nextSibling;	
										// trim nodeValue so that we can check for equality with self variable
										var humanToCheck = element.nodeValue.substring(1, element.nodeValue.length);
										humanToCheck = humanToCheck.replace(' | ', '');
										if (humanToCheck == self) {											
											var span = document.createElement('span');
											span.innerHTML = '<b>(Me)</b> | ';
											top.insertBefore(span, element.nextSibling);		
										}
									}
									
									else if (element.innerHTML == self) {
											var span = document.createElement('span');
											span.innerHTML = ' | <b>(Me)</b>';
											top.insertBefore(span, element.nextSibling);
									}
								}
							}
						}
					}
				}
			},
			
			autoscroll_livelinks: function(mutation, top, index, live) {
				if (live && document.hidden 
						&& messageList.autoscrollCheck(mutation) ) {
						
					mutation.scrollIntoView();					
				}
			},
			
			autoscroll_livelinks_active: function(mutation, top, index, live) {
				if (live && !document.hidden 
						&& messageList.autoscrollCheck(mutation)) {
							
					// trigger after 10ms delay to prevent undesired behaviour in post_title_notification
					setTimeout(() => {						
						// set autoscrolling to true to prevent clearUnreadPostsFromTitle from being triggered
						messageList.autoscrolling = true;
						$.scrollTo((mutation), 800);						
					}, 10);
					
					setTimeout(() => {
						messageList.autoscrolling = false;	
					}, 850);
				}
			},
			
			post_title_notification: function(mutation, top, index, live) {
				if (live) {
					if (mutation.style.display === "none") {
						if (messageList.config.debug) {
							console.log('not updating for ignorated post');
						}
						return;
					}
					if (mutation.getElementsByClassName('message-top')[0]
							.getElementsByTagName('a')[0].innerHTML == document
							.getElementsByClassName('userbar')[0].getElementsByTagName('a')[0].innerHTML
							.replace(/ \((\d+)\)$/, "")) {
						return;
					}
					var posts = 1;
					var ud = '';
					if (document.getElementsByClassName('message-container')[49]) {
						ud = ud + "+";
					}
					
					if (/\(\d+\)/.test(document.title)) {
						posts = parseInt(document.title.match(/\((\d+)\)/)[1]);
						document.title = "(" + (posts + 1) + ud + ") "
								+ document.title.replace(/\(\d+\) /, "");
					} 
					
					else {
						document.title = "(" + posts + ud + ") " + document.title;
					}
				}
			},
			
			notify_quote_post: function(mutation, top, index, live) {
				if (live) {
					
					if (!mutation.getElementsByClassName('quoted-message')) {
						return;
					}
					
					if (top.getElementsByTagName('a')[0].innerHTML == document
							.getElementsByClassName('userbar')[0].getElementsByTagName('a')[0].innerHTML
							.replace(/ \((\d+)\)$/, "")) {
						// dont notify when quoting own posts
						return;
					}
					
					var shouldNotify = false;
					
					var quotedMessages = mutation.getElementsByClassName('quoted-message');
					var currentUser = document.getElementsByClassName('userbar')[0]
							.getElementsByTagName('a')[0].innerHTML.replace(/ \((.*)\)$/, "");
							
					for (var i = 0; i < quotedMessages.length; i++) {					
						if (quotedMessages[i].getElementsByClassName('message-top')[0]
								.getElementsByTagName('a')[0].innerHTML == currentUser) {
									
							if (quotedMessages[i].parentNode.className != 'quoted-message') {
								// only display notification if user has been directly quoted
								shouldNotify = true;
							}
						}
					}
					
					if (shouldNotify) {					
						var user = mutation.getElementsByClassName('message-top')[0].getElementsByTagName('a')[0].innerHTML;
						
						messageList.sendMessage({
							need: "notify",
							title: "Quoted by " + user,
							message: document.title.replace(/End of the Internet - /i, '')
						});						
					}
					
				}	
			}
		},
		
		infobar: {
			imagemap_on_infobar: function() {
				// Adds link to imagemap for current topic on infobar
				var regex = window.location.search.match(/(topic=)([0-9]+)/);
				if (regex) {
					var topicNumber = regex[0];			
					var infobar = document.getElementsByClassName("infobar")[0];
					var pageRegex = window.location.search.match(/(page=)([0-9]+)/);
					var currentPage = ''
					if (pageRegex) {
						// Keep track of current page in case user decides to navigate back
						currentPage = '&oldpage=' + pageRegex[2];
					}
					var anchor = document.createElement('a');
					var divider = document.createTextNode(" | ");
					anchor.href = '/imagemap.php?' + topicNumber + currentPage;
					anchor.innerHTML = 'Imagemap';
					infobar.appendChild(divider);
					infobar.appendChild(anchor);
				}
			},
			
			filter_me: function() {				
				var tops = document.getElementsByClassName('message-top');
				
				// Handle anonymous topics
				var userRegex = /user=(\d+)$/;
				if (!userRegex.test(tops[0].getElementsByTagName('a')[0].href)) {
					var quickpostElement = document.getElementsByClassName('quickpost-body')[0];					
										
					if (quickpostElement && quickpostElement.getElementsByTagName('a')) {
						var human = quickpostElement.getElementsByTagName('a')[0]
								.innerHTML.replace('Human #', '');
								
						if (isNaN(human)) {
							// User hasn't posted in topic yet
							return;					
						} 
						
						else {
							var me = '&u=-' + human;
						}
						
					}
					
					else {
						// Can't identify user
						return;
					}
				}
				
				// Handle non-anonymous topics
				else {					
					var me = '&u=' + document.getElementsByClassName('userbar')[0]
							.getElementsByTagName('a')[0].href
							.match(/\?user=([0-9]+)/)[1];
				}
				
				var topic = window.location.href.match(/topic=([0-9]+)/)[1];
				var anchor = document.createElement('a');		
				var divider = document.createTextNode(" | ");		
				
				if (window.location.href.indexOf(me) == -1) {
					anchor.href = window.location.href.split('?')[0] + '?topic=' + topic + me;
					anchor.innerHTML = 'Filter Me';
				} else {
					anchor.href = window.location.href.replace(me, '');
					anchor.innerHTML = 'Unfilter Me';
				}
				
				var infobar = document.getElementsByClassName('infobar')[0];				
				infobar.appendChild(divider);
				infobar.appendChild(anchor);
			},
			
			expand_spoilers: function() {
				var infobar = document.getElementsByClassName('infobar')[0];
				var ains = document.createElement('span');
				var anchor = document.createElement('a');
				var divider = document.createTextNode(' | ');
				anchor.id = 'chromell_spoilers';
				anchor.href = '##';
				anchor.innerHTML = 'Expand Spoilers';
				infobar.appendChild(divider);
				infobar.appendChild(anchor);
				anchor.addEventListener('click', messageList.spoilers.find);		
			}
		},
		
		quickpostbody: {		
			quick_imagemap: function() {
				var quickpost = document.getElementsByClassName('quickpost-body')[0];
				var button = document.createElement('button');
				var divider = document.createTextNode(' ');
				var search = document.createElement('input');
				button.textContent = "Browse Imagemap";					
				button.id = "quick_image";
				search.placeholder = "Search Imagemap...";
				search.id = "image_search";
				quickpost.appendChild(divider);
				quickpost.appendChild(button);
				quickpost.appendChild(divider);
				quickpost.appendChild(search);
			},
			
			post_before_preview: function() {
				var inputs = document.getElementsByClassName('quickpost-body')[0]
						.getElementsByTagName('input');
				var input;
				var preview;
				var post;
				for (var i = 0, len = inputs.length; i < len; i++) {
					input = inputs[i];
					if (input.name == 'preview') {
						preview = input;
					}
					if (input.name == 'post') {
						post = input;
					}
				}
				post.parentNode.removeChild(post);
				preview.parentNode.insertBefore(post, preview);
			},
			
			batch_uploader: function() {
				var quickpost_body = document.getElementsByClassName('quickpost-body')[0];
				var ulBox = document.createElement('input');
				var ulButton = document.createElement('input');		
				ulBox.type = 'file';
				ulBox.multiple = true;
				ulBox.id = "batch_uploads";
				ulButton.type = "button";
				ulButton.value = "Batch Upload";
				ulButton.addEventListener('click', messageList.startBatchUpload);
				quickpost_body.insertBefore(ulBox, null);
				quickpost_body.insertBefore(ulButton, ulBox);
			},
			
			quickpost_on_pgbottom: function() {
				messageList.sendMessage({
					need: 'insertcss',
					file: 'src/css/quickpost_on_pgbottom.css' 
				});
			},
			
			quickpost_tag_buttons: function() {
				var m = document.getElementsByClassName('quickpost-body')[0];
				var txt = document.getElementById('u0_13');
				var insM = document.createElement('input');
				insM.value = 'Mod';
				insM.name = 'Mod';
				insM.type = 'button';
				insM.id = 'mod';
				insM.addEventListener("click", messageList.qpTagButton, false);
				var insA = document.createElement('input');
				insA.value = 'Admin';
				insA.name = 'Admin';
				insA.type = 'button';
				insA.addEventListener("click", messageList.qpTagButton, false);
				insA.id = 'adm';
				var insQ = document.createElement('input');
				insQ.value = 'Quote';
				insQ.name = 'Quote';
				insQ.type = 'button';
				insQ.addEventListener("click", messageList.qpTagButton, false);
				insQ.id = 'quote';
				var insS = document.createElement('input');
				insS.value = 'Spoiler';
				insS.name = 'Spoiler';
				insS.type = 'button';
				insS.addEventListener("click", messageList.qpTagButton, false);
				insS.id = 'spoiler';
				var insP = document.createElement('input');
				insP.value = 'Preformated';
				insP.name = 'Preformated';
				insP.type = 'button';
				insP.addEventListener("click", messageList.qpTagButton, false);
				insP.id = 'pre';
				var insU = document.createElement('input');
				insU.value = 'Underline';
				insU.name = 'Underline';
				insU.type = 'button';
				insU.addEventListener("click", messageList.qpTagButton, false);
				insU.id = 'u';
				var insI = document.createElement('input');
				insI.value = 'Italic';
				insI.name = 'Italic';
				insI.type = 'button';
				insI.addEventListener("click", messageList.qpTagButton, false);
				insI.id = 'i';
				var insB = document.createElement('input');
				insB.value = 'Bold';
				insB.name = 'Bold';
				insB.type = 'button';
				insB.addEventListener("click", messageList.qpTagButton, false);
				insB.id = 'b';
				m.insertBefore(insM, m.getElementsByTagName('textarea')[0]);
				m.insertBefore(insQ, insM);
				m.insertBefore(insS, insQ);
				m.insertBefore(insP, insS);
				m.insertBefore(insU, insP);
				m.insertBefore(insI, insU);
				m.insertBefore(insB, insI);
				m.insertBefore(document.createElement('br'), insB);
			},
			
			drop_batch_uploader: function() {
				// TODO: Fix this on postmsg.php
				if (window.location.pathname === "/postmsg.php") {
					return;
				}
				
				var quickreply = document.getElementsByTagName('textarea')[0];
				
				quickreply.addEventListener('drop', (evt) => {
					
					evt.preventDefault();
					
					if (evt.dataTransfer.files.length == 0) {
						console.log(evt);
						return;
					}
					
					var text = " (Uploading: 1/" + evt.dataTransfer.files.length + ")";
					document.getElementsByClassName('quickpost-body')[0].getElementsByTagName('b')[0].innerHTML += text;
							
					allPages.asyncUpload(evt.dataTransfer.files);
					
				});
			},
			
			snippet_listener: function() {			
				var ta = document.getElementsByName('message')[0];
				
				ta.addEventListener('keydown', (event) => {
					
					if (messageList.config.snippet_alt_key) {
						if (event.shiftKey == true
								&& event.key == 'Tab') {
							event.preventDefault();
							messageList.snippet.handler(ta.value, ta.selectionStart);				
						}
					}
					
					else {
						if (event.key == 'Tab') {
							event.preventDefault();
							messageList.snippet.handler(ta.value, ta.selectionStart);
						}
					}
					
				});
			},

			emoji_menu: function() {			
				messageList.emojis.addMenu();
			}
		},
		
		misc: {
			highlight_tc: function() {
				var tcs = messageList.tcs.getMessages();
				var tc;
				if (!tcs) {
					return;
				}
				for (var i = 0, len = tcs.length; i < len; i++) {
					tc = tcs[i];
					if (messageList.config.tc_highlight_color) {
						tc.getElementsByTagName('a')[0].style.color = '#'
								+ messageList.config.tc_highlight_color;
					}
				}
			},
			
			label_tc: function() {
				var tcs = messageList.tcs.getMessages();
				if (!tcs) {
					return;
				}
				var color = false;
				if (messageList.config.tc_label_color 
						&& messageList.config.tc_label_color != '') {
					color = true;
				}
				for (var i = 0, len = tcs.length; i < len; i++) {
					var tc = tcs[i];
					var span = document.createElement('span');
					var b = document.createElement('b');
					var text = document.createTextNode('TC');
					var divider = document.createTextNode(' | ');
					b.appendChild(text);
					if (color) {
						b.style.color = '#' + messageList.config.tc_label_color;
					}
					span.appendChild(divider);
					span.appendChild(b);			
					username = tc.getElementsByTagName('a')[0];
					username.outerHTML += span.innerHTML;
				}
			},
			
			pm_title: function() {
				if (window.location.href.indexOf('inboxthread.php') == -1) {
					return;
				}
				var me = document.getElementsByClassName('userbar')[0]
						.getElementsByTagName('a')[0].innerHTML;
				var other = '';
				var tops = document.getElementsByClassName('message-top');
				var top;
				for (var i = 0, len = tops.length; i < len; i++) {
					top = tops[i];
					if (top.getElementsByTagName('a')[0].innerHTML.indexOf(me) == -1) {
						other = top.getElementsByTagName('a')[0].innerHTML;
						break;
					}
				}
				document.title = "PM - " + other;
			},
			
			post_title_notification: function() {
				document.addEventListener('visibilitychange', messageList.clearUnreadPostsFromTitle);
				document.addEventListener('scroll', messageList.clearUnreadPostsFromTitle);
				document.addEventListener('mousemove', messageList.clearUnreadPostsFromTitle);
			},
			
			click_expand_thumbnail: function(newPost) {
				var messages;
				if (newPost && typeof newPost != 'string') {
					messages = newPost.getElementsByClassName('message');
				} else {
					messages = document.getElementsByClassName('message');
				}
				for (var i = 0, len = messages.length; i < len; i++) {
					var message = messages[i];
					// rewritten by xdrvonscottx
					// find all the placeholders before the images are loaded
					var pholds = message.getElementsByClassName('img-placeholder');
					for (var j = 0; j < pholds.length; j++) {
						var phold = pholds[j];
						messageList.image.observer.observe(phold, {
							attributes: true,
							childList: true
						});
					}
				}
			},				
			
			loadquotes: function() {
				function getElementsByClass(searchClass, node, tag) {
					var classElements = new Array();
					if (node == null)
						node = document;
					if (tag == null)
						tag = '*';
					var els = node.getElementsByTagName(tag);
					var elsLen = els.length;
					for (var i = 0, j = 0; i < elsLen; i++) {
						if (els[i].className == searchClass) {
							classElements[j] = els[i];
							j++;
						}
					}
					return classElements;
				}

				function imagecount() {
					var imgs = document.getElementsByTagName('img').length;
					return imgs;
				}

				if (document.location.href.indexOf("https") == -1) {
					var url = "http";
				} else {
					var url = "https";
				}

				function coolCursor() {
					this.style.cursor = 'pointer';
				}

				function processPage(XML, element) {
					var newPage = document.createElement("div");
					newPage.innerHTML = XML;
					var newmessage = getElementsByClass('message', newPage, null)[0];
					var scripttags = newmessage.getElementsByTagName('script');
					for (var i = 0; i < scripttags.length; i++) {
						var jsSource = scripttags[i].innerHTML
								.replace(
										/onDOMContentLoaded\(function\(\)\{new ImageLoader\(\$\("u0_1"\), "\\\/\\\//gi,
										'').replace(/\\/gi, '').replace(/\)\}\)/gi, '')
								.split(',');
						var replacement = new Image();
						replacement.src = url + '://' + jsSource[0].replace(/"$/gi, '');
						replacement.className = 'expandimagesLOL';
						scripttags[i].parentNode.replaceChild(replacement,
								scripttags[i]);
						i--;
					}
					if (newmessage.innerHTML.indexOf('---') != -1) {
						var j = 0;
						while (newmessage.childNodes[j]) {
							if (newmessage.childNodes[j].nodeType == 3
									&& newmessage.childNodes[j].nodeValue
											.indexOf('---') != -1) {
								while (newmessage.childNodes[j]) {
									newmessage.removeChild(newmessage.childNodes[j]);
								}
							}
							j++;
						}
					}
					element.parentNode.appendChild(newmessage);
				}

				function loadMessage() {
					var mssgurl = this.id;
					var newSpan = document.createElement('span');
					newSpan.innerHTML = 'Loading message...';
					var loadingImg = new Image();
					loadingImg.src = 'data:image/gif;base64,'
							+ 'R0lGODlhEAAQAPIAAP///2Zm/9ra/o2N/mZm/6Cg/rOz/r29/iH/C05FVFNDQVBFMi4wAwEAAAAh/hpD'
							+ 'cmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZ'
							+ 'nAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQJCgAAACwAAAAAEAAQAAADNAi6'
							+ '3P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkECQoAAAAs'
							+ 'AAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKp'
							+ 'ZBqfvwQAIfkECQoAAAAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8D'
							+ 'YlJd8z0fMDgsGo/IpHI5TAAAIfkECQoAAAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJU'
							+ 'lIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQJCgAAACwAAAAAEAAQAAADMwi6IMKQORfjdOe8'
							+ '2p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQJCgAAACwAAAAAEAAQAAAD'
							+ 'Mgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAkKAAAA'
							+ 'LAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsR'
							+ 'kAAAOwAAAAAAAAAAAA==';
					this.parentNode.insertBefore(newSpan, this);
					this.parentNode.replaceChild(loadingImg, this);
					var ajax = new XMLHttpRequest();
					ajax.open('GET', url + '://boards.endoftheinter.net/message.php?'
							+ mssgurl, true);
					ajax.send(null);
					ajax.onreadystatechange = function() {
						if (ajax.readyState == 4) {
							if (ajax.status == 200) {
								processPage(ajax.responseText, newSpan);
								loadingImg.parentNode.removeChild(loadingImg);
								newSpan.parentNode.removeChild(newSpan);
							} else {
								alert("An error occurred loading the message. Fuck shit.");
							}
						}
					}
				}

				function findQuotes() {
					var quotes = getElementsByClass('quoted-message', document, 'div');
					for (var i = 0; i < quotes.length; i++) {
						var anchors = quotes[i].getElementsByTagName('a');
						for (var j = 0; j < anchors.length; j++) {
							if (anchors[j].innerHTML == '[quoted text omitted]') {
								anchors[j].removeAttribute('href');
								var parts = anchors[j].parentNode.getAttribute('msgid')
										.split(',');
								var secondsplit = parts[2].split('@');
								anchors[j].id = 'id=' + secondsplit[0] + '&topic='
										+ parts[1] + '&r=' + secondsplit[1];
								anchors[j].addEventListener('click', loadMessage, true);
								anchors[j].style.textDecoration = 'underline';
								anchors[j].title = 'Click to load the omitted message';
								anchors[j].addEventListener('mouseover', coolCursor,
										true);
							}
						}
					}
				}

				var currentMessages = 0;

				function checkMssgs() {
					var mssgs = getElementsByClass('message-container', document
							.getElementById('u0_1'), 'div').length;
					if (mssgs > currentMessages) {
						findQuotes();
						currentMessages = mssgs;
					}
				}
				var interval = window.setInterval(checkMssgs, 1000);
			}
		}
	},
	
	handleEvent: {
		
		/**
		 *  Takes message containing name user, and unhides any currently ignorated posts by that user
		 */
		
		onReceiveMessage: function(msg) {
			if (msg.action === 'showIgnorated') {
				var ignoratedPosts = document.getElementsByClassName('ignorated');
				var postsToShow = [];
				
				for (var i = 0, len = ignoratedPosts.length; i < len; i++) {
					var ignoratedPost = ignoratedPosts[i];
					var usernameElement = ignoratedPost.getElementsByTagName('a')[0];
					
					if (msg.value.toLowerCase() == usernameElement.innerHTML.toLowerCase()) {
						postsToShow.push(ignoratedPost);
					}							
				}
				
				// Iterate backwards so we can swap classes
				for (var i = postsToShow.length - 1; i >= 0; i--) {
					var postToShow = postsToShow[i];														
					postToShow.classList.remove('ignorated');
					// ignorated_post_peek sets display to "block" and opacity to 0.7
					postToShow.classList.add('ignorated_post_peek');
					
					if (i === 0) {
						$.scrollTo(postToShow);
					}
				}
			}
		},

		
		/**
		 *  After updating extension or reloading background page, it's not possible to send or receive messages
		 *  from orphaned content scripts (see https://bugs.chromium.org/p/chromium/issues/detail?id=168263).
		 *  If we detect the onDisconnect event, we should save user input and reload the page.
		 */	 
		
		onPortDisconnect: function(port) {			
			if (document.getElementsByClassName('quickpost').length > 0) {
				var quickpost = document.getElementsByName('message')[0];
				sessionStorage.setItem('quickpost_value', quickpost.value);
				sessionStorage.setItem('quickpost_caret_position', quickpost.selectionStart);
			}
			
			sessionStorage.setItem('scrollx', window.scrollX);
			sessionStorage.setItem('scrolly', window.scrollY);
			
			window.location.reload();				
		},

		
		/**
		 *  Recieves new livelinks posts and applies any required modifications
		 */
		
		newPost: function(container) {
			var top = container.getElementsByClassName('message-top')[0];
			var index = document.getElementsByClassName('message-container').length;
			var pm = '';
			
			if (window.location.pathname === '/inboxthread.php') {			
				pm = "_pm";
			}
			
			for (var i in this.dom.messagecontainer) {
				if (this.config[i + pm]) {
						// Fourth parameter signifies that we are dealing with livelinks post
						// TODO: Refactor this
						this.dom.messagecontainer[i](container, top, index, true);
				}
			}
			
			this.addListeners(container);
			this.links.check(container);
			
			if (this.config.click_expand_thumbnail) {
				this.dom.misc.click_expand_thumbnail(container);
			}
			
			var usernameElement = top.getElementsByTagName('a')[0];
			
			// Add username_anchor class for user info popup mouseenter listener
			if (usernameElement.innerHTML != 'Filter' && this.config.user_info_popup) {
				usernameElement.className = 'username_anchor';
			}
					
			if (!this.config.hide_ignorator_badge) {
				
				var ignoratorData = {
					action: 'ignorator_update',
					ignorator: this.ignorated,
					scope: "messageList"
				};
				
				try {
					// Send updated ignorator data to background page
					this.globalPort.postMessage(ignoratorData);
					
				} catch(e) {
					// We should attempt to reinitialise the connections to background page
					this.globalPort = chrome.runtime.connect();
					
					if (this.globalPort) {
						this.globalPort.onMessage.addListener(this.handleEvent.ignoratorUpdate);
					}
					
					try {
						// Send data again
						this.globalPort.postMessage(ignoratorData);
						console.log('Warning: content script was disconnected from background page, but recovered');
						
					} catch(e) {
						// Not much else we can do - wait for user to reload the page.
						console.log('Error while sending data to background page:', e);
					}
				}
			}
		},

		
		/**
		 *  Because ChromeLL adds so many clickable elements to the screen,
		 *  we use a single handler for click events and detirmine which was 
		 *  clicked from its attributes. This prevents us from having 
		 *  to attach a listener to each element on creation.
		 */ 
		 
		mouseclick: function(evt) {
			if (this.config.post_templates) {
				this.postTemplateAction(evt.target);
			}
			
			switch (evt.target.id) {
				case 'notebook':
					this.usernotes.open(evt.target);
					evt.preventDefault();
					return;
					
				case 'quick_image':
					// Note: imagemap object located in imagemap.js
					imagemap.init();
					evt.preventDefault();
					return;
			}
			
			switch (evt.target.className) {		
				case 'l':		
					// Fix relative URLs for LUEpedia (note that index === 0)
					if (evt.target.title.indexOf("/index.php") === 0) {
						this.links.fixRelativeUrls(evt.target, "wiki");
						evt.preventDefault();						
					}
					
					// Fix relative URLs for imagemap
					else if (evt.target.title.indexOf("/imap/") === 0) {
						this.links.fixRelativeUrls(evt.target, "imagemap");					
						evt.preventDefault();
					}
					
					// Fix relative URLs for archive links
					else if (evt.target.innerHTML.indexOf('://archives.endoftheinte') > -1) {
						this.links.fixRelativeUrls(evt.target, "archives");
						evt.preventDefault();												
					}
			
					return;
					
				case 'emoji_button':
					this.emojis.toggleMenu(evt);
					evt.preventDefault();
					return;		

				case 'clear_emoji_history':
					this.emojis.clearHistory();
					evt.preventDefault();
					return;					
			
				case 'like_button':
					this.likeButton.buildMarkup(evt.target);
					evt.preventDefault();
					return;
				
				case 'like_button_custom':
					var templateNumber = evt.target.id;
					for (var i = 0, len = evt.path.length; i < len; i++) {
						var pathNode = evt.path[i];
						if (pathNode.className == 'like_button') {
							this.likeButton.buildMarkup(pathNode, templateNumber);			
							break;
						}
					}
					evt.preventDefault();				
					return;
					
				case 'archivequote':
					this.quote.handler(evt);
					evt.preventDefault();
					return;
					
				case 'youtube':
					if (evt.target.tagName === 'DIV') {
						// Prevent clicks on div from bubbling up to parent
						evt.preventDefault();
						return;
					}
					else {
						// Prevent [Embed] links from remaining on screen if user navigates to the YouTube link					
						this.youtube.hideEmbedLink();
					}
					return;
				
				case 'gfycat':
					if (evt.target.tagName === 'DIV') {
						// Prevent clicks on div from bubbling up to parent
						evt.preventDefault();
					}
					return;
					
				case 'embed_nws_gfy':
					var gfycatID = evt.target.parentNode.id.replace('_embed', '');
					this.gfycat.embed(document.getElementById(gfycatID));
					evt.preventDefault();
					return;
					
				case 'embed':
					this.youtube.embed(evt.target.parentNode);
					evt.preventDefault();
					return;

				case 'hide':
					this.youtube.hide(evt.target.parentNode);
					// Manually remove [Hide] span
					this.youtube.hideEmbedLink();
					evt.preventDefault();
					return;				

				case 'emoji_type':
					this.emojis.switchType(evt);
					evt.preventDefault();
					return;
					
				case 'emoji':
					this.emojis.selectEmoji(evt);
					evt.preventDefault();
					return;
			}
		},		
		
		mouseenter: function(evt) {
			switch (evt.target.className) {
				case 'like_button':
					this.cachedEvent = evt;
					this.menuDebouncer = setTimeout(this.likeButton.showOptions.bind(this.likeButton), 250);
					break;
				
				case 'username_anchor':
					allPages.cachedEvent = evt;
					this.popupDebouncer = setTimeout(allPages.popup.handler.bind(allPages.popup), 750);				
					break;
				
				case 'youtube':
					this.youtube.debouncerId = setTimeout(this.youtube.showEmbedLink.bind(this.youtube, evt), 400);
					break;
				
				case 'nws_gfycat':
					this.gfycat.debouncerId = setTimeout(this.gfycat.showEmbedLink.bind(this.gfycat, evt), 400);
					break;
					
				case 'nws_imgur':
					this.imgur.debouncerId = setTimeout(this.imgur.showEmbedLink.bind(this.imgur, evt), 400);
					break;
				
				default:
					break;
			}
		},
		
		mouseleave: function(evt) {
			clearTimeout(this.youtube.debouncerId);
			clearTimeout(this.gfycat.debouncerId);
			clearTimeout(this.imgur.debouncerId);
			
			clearTimeout(this.menuDebouncer);
			clearTimeout(this.popupDebouncer);			
			
			if (document.getElementById('hold_menu')) {
				this.likeButton.hideOptions();
				evt.preventDefault();
			}
			else if (evt.target.className === 'youtube') {
				this.youtube.hideEmbedLink();
			}
			else if (evt.target.className === 'nws_gfycat') {
				this.gfycat.hideEmbedLink();
			}
			else if (evt.target.className === 'nws_imgur') {
				this.imgur.hideEmbedLink();
			}
			
		},
		
		keydown: function(evt) {
			const RETURN_KEY = 13;
			
			if (document.activeElement.id === 'image_search') {
				if (evt.keyCode === RETURN_KEY) {
					imagemap.search.init.call(imagemap.search);
					evt.preventDefault();
				}
				else if (messageList.config.auto_image_search) {
					this.searchDebouncer = setTimeout(this.likeButton.showOptions.call(this.likeButton), 400);
				}
			}
		},
		
		search: function() {
			clearTimeout(this.imagemapDebouncer);
			
			this.imagemapDebouncer = setTimeout(() => {
								
				if (document.getElementById('search_results')) {			
					imagemap.search.init.call(imagemap.search);
				}
				
			}, 250);
		}
	},

	
	/**
	 *  To reduce CPU load, we only embed videos that are visible in viewport,
	 *  and pause any videos which are no longer visible.
	 */
	
	mediaLoader: function() {
		var links = document.getElementsByClassName('media');
		var height = window.innerHeight;
					
		for (var i = 0, len = links.length; i < len; i++) {
			var link = links[i];
			var position = link.getBoundingClientRect();
			var nameAttribute = link.getAttribute('name');
			// use window height + 200 to increase visibility of gfycatLoader
			if (position.top > height + 200 || position.bottom < 0) {
						
				if (nameAttribute == 'embedded' || nameAttribute == 'embedded_thumb') {
						
					if (!link.getElementsByTagName('video')[0].paused) {
						// pause hidden video elements to reduce CPU load
						link.getElementsByTagName('video')[0].pause();							
					}
				}
			}
			
			else if (link.tagName == 'A') {
				if (link.classList.contains('gfycat')) {
					messageList.gfycat.checkLink(link);
				}
				else if (link.classList.contains('imgur')) {
					messageList.imgur.checkLink(link);
				}
			}
			
			else if (nameAttribute == 'placeholder') {
				if (link.classList.contains('gfycat')) {
					messageList.gfycat.embed(link);
				}
				else if (link.classList.contains('imgur')) {
					messageList.imgur.embed(link);
				}
			}
			
			else if (nameAttribute == 'embedded' && link.getElementsByTagName('video')[0].paused) {
				link.getElementsByTagName('video')[0].play();
			}
		}
	},
	
	mediaPauser: function() {
		// pause all videos if document is hidden
		if (document.hidden) {
			var videos = document.getElementsByTagName('video');
			var video;
			for (var i = 0, len = videos.length; i < len; i++) {
				video = videos[i];
				if (video.src &&
						!video.paused) {
					video.pause();
				}
			}
		}
		else {
			// call gfycatLoader so that only visible gfycat videos are played
			// if document visibility changes from hidden to not hidden
			messageList.mediaLoader();
		}
	},
	
	gfycat: {
		debouncerId: '', // id for setTimeout()
		
		checkLink: function(gfycatElement) {
			var url = gfycatElement.getAttribute('href');
			
			this.getDataFromApi(url, (data) => {
				
				if (data === "error") {
					// revert class name to stop gfycat loader from detecting link
					gfycatElement.className = 'l';
					return;
				}						
				
				else {
					messageList.gfycat.checkWorkSafe(gfycatElement, data.nsfw, (isWorkSafe) => {
						
						if (!isWorkSafe && messageList.config.hide_nws_gfycat && !/N[WL]S/.test(document.getElementsByTagName('h2')[0].innerHTML)) {
							gfycatElement.className = 'nws_gfycat';
							gfycatElement.setAttribute('w', data.width);
							gfycatElement.setAttribute('h', data.height);
							gfycatElement.id = data.webm;
							gfycatElement.addEventListener('mouseenter', messageList.handleEvent.mouseenter.bind(messageList));
							gfycatElement.addEventListener('mouseleave', messageList.handleEvent.mouseleave.bind(messageList));
						}
						
						else {					
							if (gfycatElement.getAttribute('name') == 'gfycat_thumb') {								
								var splitURL = url.split('/').slice(-1);
								var code = splitURL.join('/');
								var thumbnailUrl = 'http://thumbs.gfycat.com/' + code + '-poster.jpg';
								
								messageList.gfycat.createThumbnail(gfycatElement, url, thumbnailUrl, data);
							} 
							
							else {
								messageList.gfycat.createPlaceholder(gfycatElement, url, data);
							}
						}
						
					});
				}
			});		
		
		},
		
		getDataFromApi: function (url, callback) {
			var splitURL = url.split('/').slice(-1);
			var code = splitURL.join('/');
			var xhr = new XMLHttpRequest();
			xhr.open("GET", window.location.protocol + '//gfycat.com/cajax/get/' + code, true);
			xhr.onload = function() {
				if (xhr.status == 200) {
					var apiData = {};
					// gfycat api provides width, height, & webm url
					var response = JSON.parse(xhr.responseText);
					
					if (response.error) {
						callback("error");
						return;
					}
					
					var width = response.gfyItem.width;
					var height = response.gfyItem.height;
					
					if (messageList.config.resize_gfys 
							&& width > messageList.config.gfy_max_width) {
						// scale video size to match gfy_max_width value
						height = (height / (width / messageList.config.gfy_max_width));
						width = messageList.config.gfy_max_width;
					}

					apiData.nsfw = response.gfyItem.nsfw;
					apiData.height = height;
					apiData.width = width;
					apiData.webm = response.gfyItem.webmUrl;
					callback(apiData);
				}
			};
			xhr.send();
		},
		
		createPlaceholder: function(gfycatElement, url, data) {
			var display;
			(messageList.config.show_gfycat_link)
					? display = 'inline'
					: display = 'none';	
			
			// create placeholder
			var placeholder = document.createElement('div');
			placeholder.className = 'gfycat';
			placeholder.id = data.webm;
			placeholder.setAttribute('name', 'placeholder');

			var video = document.createElement('video');
			video.setAttribute('width', data.width);
			video.setAttribute('height', data.height);
			video.setAttribute('loop', true);

			var linkSpan = document.createElement('a');
			linkSpan.style.display = display;
			linkSpan.href = url;
			linkSpan.innerHTML = '<br><br>' + url;

			placeholder.appendChild(video);
			placeholder.appendChild(linkSpan);						
					
			// prevent "Cannot read property 'replaceChild' of null" error
			if (gfycatElement.parentNode) {
				
				gfycatElement.parentNode.replaceChild(placeholder, gfycatElement);
				// check if placeholder is visible (some placeholders will be off screen)
				var position = placeholder.getBoundingClientRect();
				
				if (position.top > window.innerHeight) {
					return;
				} 
				
				else {
					// pass placeholder video element to embed function
					messageList.gfycat.embed(placeholder);
				}
			}
		},
		
		createThumbnail: function(gfycatElement, url, thumbnailUrl, data) {
			var display;
			(messageList.config.show_gfycat_link)
					? display = 'inline'
					: display = 'none';
			
			// create placeholder element
			var placeholder = document.createElement('div');
			placeholder.className = 'gfycat';
			placeholder.id = data.webm;
			
			var thumbnail = document.createElement('img');
			thumbnail.setAttribute('src', thumbnailUrl);
			thumbnail.setAttribute('width', data.width);
			thumbnail.setAttribute('height', data.height);
			
			var linkSpan = document.createElement('a');
			linkSpan.style.display = display;
			linkSpan.href = url;
			linkSpan.innerHTML = '<br><br>' + url;			
			
			placeholder.appendChild(thumbnail);
			placeholder.appendChild(linkSpan);
			
			if (gfycatElement.parentNode) {
				gfycatElement.parentNode.replaceChild(placeholder, gfycatElement);
				
				// add click listener to replace img with video
				var img = placeholder.getElementsByTagName('img')[0];
				img.title = "Click to play";
				
				img.addEventListener('click', (evt) => {
					
					evt.preventDefault();
					
					var video = document.createElement('video');
					video.setAttribute('width', data.width);
					video.setAttribute('height', data.height);
					video.setAttribute('loop', true);
					
					evt.target.parentNode.replaceChild(video, img);
					
					var video = placeholder.getElementsByTagName('video')[0];
					placeholder.setAttribute('name', 'embedded_thumb');
					video.src = placeholder.id;
					video.title = "Click to pause";
					video.play();
					
					video.addEventListener('click', () => {					
						video.title = "Click to play/pause";
						
						if (!video.paused) {
							video.pause();
						}
						
						else {
							video.play();
						}
						
					});
					
				});	
			}
		},
		
		checkWorkSafe: function(gfycatElement, nsfw, callback) {
			var userbar = document.getElementsByTagName('h2')[0];
			// only check topics without NWS/NLS tags
			if (!/N[WL]S/.test(userbar.innerHTML)) {
				
				var post = gfycatElement.parentNode;
				
				if (nsfw === '1' || post && /(n[wl]s)/i.test(post.innerHTML)) {
					gfycatElement.className = 'nws_gfycat';
					callback(false);
				}
				
				else {
					callback(true);
				}
			}
			
			else {
				callback(true);
			}
		},
		
		showEmbedLink: function(evt) {
			var target = evt.target;
			var anchor = document.createElement('a');
			anchor.id = target.id;
			anchor.className = 'embed_nws_gfy';
			anchor.href = '#embed';
			anchor.style.backgroundColor = window.getComputedStyle(document.getElementsByClassName('message')[0]).backgroundColor;
			anchor.style.display = 'inline';
			anchor.style.position = 'absolute';
			anchor.style.zIndex = 1;
			anchor.style.fontWeight = 'bold';
			anchor.innerHTML = '&nbsp[Embed NWS Gfycat]';
			
			target.appendChild(anchor);
		},
		
		hideEmbedLink: function() {
			if (document.getElementsByClassName('embed_nws_gfy').length > 0) {
				var embedLink = document.getElementsByClassName('embed_nws_gfy')[0];
				embedLink.parentNode.removeChild(embedLink);
			}
		},
		
		embed: function(placeholder) {
			if (placeholder.className === 'gfycat') {
				// use placeholder element to embed gfycat video
				var video = placeholder.getElementsByTagName('video')[0];
				if (messageList.config.show_gfycat_link) {
					placeholder.getElementsByTagName('span')[0].style.display = 'inline';
				}
				placeholder.setAttribute('name', 'embedded');
				// placeholder id is webm url
				video.src = placeholder.id;
				video.play();
			}
			else if (placeholder.className === 'nws_gfycat') {
				// create video element & embed gfycat
				var video = document.createElement('video');
				var width = placeholder.getAttribute('w');
				var height = placeholder.getAttribute('h');				
				video.setAttribute('width', width);
				video.setAttribute('height', height);
				video.setAttribute('name', 'embedded');
				video.setAttribute('loop', true);
				video.src = placeholder.id;				
				placeholder.parentNode.replaceChild(video, placeholder);			
				video.play();
			}
		}
	},
	
	imgur: {
		debouncerId: '',
		
		checkLink: function(imgurElement) {
			var splitURL = imgurElement.href.split('/').slice(-1);
			var code = splitURL.join('/').replace(/.gifv|.webm|.gif/, '');
			if (!imgurElement.classList.contains('checked')) {				
				this.getDataFromApi(code, (data) => {
					imgurElement.classList.add('checked');
					
					if (data.error) {
						if (imgurElement.classList.contains('imgur')) {
							var container = document.createElement('span');
							container.style.display = 'inline-block';
							
							var notFoundSpan = document.createElement('span');
							notFoundSpan.style.textDecoration = 'none';
							notFoundSpan.style.verticalAlign = 'super'; // Superscript
							notFoundSpan.style.fontSize = 'smaller';
							notFoundSpan.style.color = 'red';						
							notFoundSpan.innerHTML = '&nbsp' + data.error;
							
							// Append 404 in superscript
							container.appendChild(notFoundSpan);
							imgurElement.appendChild(container);
						}
						
						imgurElement.className = 'l';
						return;
					}
					
					else if (data.nsfw === false && messageList.config.hide_nws_gfycat) {
						imgurElement.className = 'nws_imgur';
						imgurElement.setAttribute('width', data.width);
						imgurElement.setAttribute('height', data.height);
						imgurElement.id = data.url;
						imgurElement.addEventListener('mouseenter', messageList.handleEvent.mouseenter.bind(messageList));
						imgurElement.addEventListener('mouseleave', messageList.handleEvent.mouseleave.bind(messageList));					
					}
					
					else {
						if (imgurElement.getAttribute('name') == 'imgur_thumb') {
							// Large thumbnail url
							var thumbnailUrl = window.location.protocol + '//i.imgur.com/' + code + 'l.jpg';						
							messageList.imgur.createThumbnail(imgurElement, thumbnailUrl, data);
						} 
						
						else {
							messageList.imgur.createPlaceholder(imgurElement, data);
						}
					}
					
				});		
			}
		},
		
		getDataFromApi: function(code, callback) {
			// Documentation for the Imgur image data model: https://api.imgur.com/models/image
			const API_KEY = 'Client-ID 6356976da2dad83';

			var url = 'https://api.imgur.com/3/image/' + code;
			
			chrome.runtime.sendMessage({
				
				need: "xhr",
				url: url,
				auth: API_KEY
				
			}, (response) => {
				
				var jsonResponse = JSON.parse(response);
				this.handleResponse(jsonResponse, callback);				
				
			});	
		},
		
		handleResponse: function(jsonResponse, callback) { 
			// Check for errors
			if (!jsonResponse || !jsonResponse.success) {
				if (!jsonResponse) {
					// Background page returns false if 404 error is detected
					callback({ error: 404 });
				}
				else if (!jsonResponse.success) {
					callback({ error: jsonResponse.status });
				}				
			}
			
			else {			
				var data = jsonResponse.data;
				
				var url = data.mp4;
				
				var width = data.width;
				var height = data.height;
				
				if (messageList.config.resize_imgurs && data.width > messageList.config.imgur_max_width) {
					width = messageList.imgur_max_width;
					height = height / (width / messageList.config.imgur_max_width);
				}
				
				var title = data.title || data.redditIdText;
				var nsfw = data.nsfw;
				
				callback({
					width: width,
					height: height,
					url: url,
					title: title,
					nsfw: nsfw
				});
			}
		},
		
		createThumbnail: function(imgurElement, thumbnailUrl, data) {			
			// create placeholder element
			var placeholder = document.createElement('div');
			placeholder.className = 'imgur';
			placeholder.id = data.url;
			
			var thumbnail = document.createElement('img');
			thumbnail.setAttribute('src', thumbnailUrl);
			thumbnail.setAttribute('width', data.width);
			thumbnail.setAttribute('height', data.height);		
			
			placeholder.appendChild(thumbnail);
			
			if (imgurElement.parentNode) {
				imgurElement.parentNode.replaceChild(placeholder, imgurElement);
				
				// add click listener to replace img with video
				var img = placeholder.getElementsByTagName('img')[0];
				img.title = "Click to play";
				
				img.addEventListener('click', (evt) => {
					
					evt.preventDefault();
					
					var video = document.createElement('video');
					video.setAttribute('width', data.width);
					video.setAttribute('height', data.height);
					video.setAttribute('loop', true);
					
					evt.target.parentNode.replaceChild(video, img);
					
					var video = placeholder.getElementsByTagName('video')[0];
					placeholder.setAttribute('name', 'embedded_thumb');
					video.src = placeholder.id;
					video.title = "Click to pause";
					video.play();
					
					video.addEventListener('click', () => {					
						video.title = "Click to play/pause";
						
						if (!video.paused) {
							video.pause();
						}
						
						else {
							video.play();
						}
						
					});
					
				});	
			}
		},
		
		createPlaceholder: function(imgurElement, data) {		
			// create placeholder
			var placeholder = document.createElement('div');
			placeholder.className = 'imgur';
			placeholder.id = data.url;
			placeholder.setAttribute('name', 'placeholder');

			var video = document.createElement('video');
			video.setAttribute('width', data.width);
			video.setAttribute('height', data.height);
			video.setAttribute('loop', true);

			placeholder.appendChild(video);				
					
			// prevent "Cannot read property 'replaceChild' of null" error
			if (imgurElement.parentNode) {
				
				imgurElement.parentNode.replaceChild(placeholder, imgurElement);
				// check if placeholder is visible (some placeholders will be off screen)
				var position = placeholder.getBoundingClientRect();
				
				if (position.top > window.innerHeight) {
					return;
				} 
				
				else {
					// pass placeholder video element to embed function
					messageList.imgur.embed(placeholder);
				}
			}
		},
		
		embed: function(placeholder) {
			if (placeholder.className === 'imgur') {
				// use placeholder element to embed gfycat video
				var video = placeholder.getElementsByTagName('video')[0];
				if (messageList.config.show_gfycat_link) {
					placeholder.getElementsByTagName('span')[0].style.display = 'inline';
				}
				placeholder.setAttribute('name', 'embedded');
				// placeholder id is mp4 url
				video.src = placeholder.id;
				video.play();
			}
			else if (placeholder.className === 'nws_imgur') {
				// create video element & embed gfycat
				var video = document.createElement('video');
				var width = placeholder.getAttribute('width');
				var height = placeholder.getAttribute('height');		
				video.setAttribute('width', width);
				video.setAttribute('height', height);
				video.setAttribute('name', 'embedded');
				video.setAttribute('loop', true);
				video.src = placeholder.id;				
				placeholder.parentNode.replaceChild(video, placeholder);			
				video.play();
			}
		},
		
		showEmbedLink: function(evt) {
			var target = evt.target;
			var anchor = document.createElement('a');
			anchor.id = target.id;
			anchor.className = 'embed_nws_imgur';
			anchor.href = '#embed';
			anchor.style.backgroundColor = window.getComputedStyle(document.getElementsByClassName('message')[0]).backgroundColor;
			anchor.style.display = 'inline';
			anchor.style.position = 'absolute';
			anchor.style.zIndex = 1;
			anchor.style.fontWeight = 'bold';
			anchor.innerHTML = '&nbsp[Embed NWS Imgur]';
			
			target.appendChild(anchor);
		},
		
		hideEmbedLink: function() {
			if (document.getElementsByClassName('embed_nws_imgur').length > 0) {
				var embedLink = document.getElementsByClassName('embed_nws_imgur')[0];
				embedLink.parentNode.removeChild(embedLink);
			}
		},		
		
	},
	
	youtube: {
		debouncerId: '', // Stores setTimeout() id for embed link
		
		showEmbedLink: function(evt) {
			var target = evt.target;
			var span = document.createElement('span');
			span.id = target.id;
			span.className = 'embed';
			span.style.backgroundColor = window.getComputedStyle(document.getElementsByClassName('message')[0]).backgroundColor;
			span.style.display = 'inline';
			span.style.position = 'absolute';
			span.style.zIndex = 1;
			span.style.fontWeight = 'bold';
			span.style.textDecoration = 'underline';
			span.style.cursor = 'pointer';			
			span.innerHTML = '&nbsp[Embed]';
			
			target.appendChild(span);
		},
		
		hideEmbedLink: function() {
			if (document.getElementsByClassName('embed').length > 0) {
				var embedLink = document.getElementsByClassName('embed')[0];
				embedLink.parentNode.removeChild(embedLink);
			}
			else if (document.getElementsByClassName('hide').length > 0) {
				var embedLink = document.getElementsByClassName('hide')[0];
				embedLink.parentNode.removeChild(embedLink);
			}
		},
		
		embed: function(span) {
			var toEmbed = document.getElementById(span.id);
			var backgroundColor = window.getComputedStyle(document.getElementsByClassName('message')[0]).backgroundColor;
			var videoCode;
			var embedHTML;
			var href = toEmbed.href;
			var timeCode;
			var timeCodeCheck = href.match(/(\?|\&|#)(t=)/);
			if (timeCodeCheck) {
				var substring = href.substring(timeCodeCheck.index, href.length);
				timeCode = substring.match(/([0-9])+([h|m|s])?/g);
			}
			var regExp = /^.*(youtu.be\/|v\/|u\/\w\/\/|watch\?v=|\&v=)([^#\&\?]*).*/;			
			var match = span.id.match(regExp);
			
			if (match && match[2].length == 11) {
				videoCode = match[2];
			} 
			
			else {
				videoCode = match;
			}
			
			
			if (timeCode) {
				videoCode += this.buildTimeCode(timeCode);
			}
								
			this.hideEmbedLink();
			toEmbed.className = "hideme";
			toEmbed.appendChild(this.createYouTubeElements(span.id, videoCode, backgroundColor));
		},
		
		buildTimeCode: function(timeCode) {
			var seconds = 0;
			for (var i = 0, len = timeCode.length; i < len; i++) {
				var splitTime = timeCode[i];
				if (!/([h|m|s])/.test(splitTime)) {
					// timecode is probably in format "#t=xx" 
					seconds += splitTime;
				}
				else if (splitTime.indexOf('h') > -1) {
					var temp = Number(splitTime.replace('h', ''), 10);
					seconds += temp * 60 * 60;
				}
				else if (splitTime.indexOf('m') > -1) {
					var temp = parseInt(splitTime.replace('m', ''), 10);
					seconds += temp * 60;
				}
				else if (splitTime.indexOf('s') > -1) {
					seconds += parseInt(splitTime.replace('s', ''), 10);
				}
			}
			return "?start=" + seconds;			
		},
		
		createYouTubeElements: function(id, videoCode, backgroundColor) {
			const VIDEO_WIDTH = 640;
			const VIDEO_HEIGHT = 390;
			
			// Create span to hide embedded video
			var span = document.createElement('span');
			span.style.display = 'inline';
			span.style.position = 'absolute';
			span.style.backgroundColor = backgroundColor;
			span.style.fontWeight = 'bold';
			span.style.textDecoration = 'underline';
			span.style.cursor = 'pointer';
			span.style.zIndex = 1;
			span.className = 'hide';			
			span.id = id;
			span.innerHTML = '&nbsp[Hide]'
			
			var lineBreak = document.createElement('br');
			
			// Create div containing YouTube iframe
			var div = document.createElement('div');
			div.className = 'youtube';
			
			// Create iframe
			var iframe = document.createElement('iframe');
			iframe.id = 'yt' + id;
			iframe.src = 'https://www.youtube.com/embed/' + videoCode;
			
			iframe.setAttribute('type', 'text/html');
			iframe.setAttribute('width', VIDEO_WIDTH);
			iframe.setAttribute('height', VIDEO_HEIGHT);
			iframe.setAttribute('autoplay', 0);
			iframe.setAttribute('frameborder', 0);
			iframe.setAttribute('allowfullscreen', 'allowfullscreen');			
						
			var fragment = document.createDocumentFragment();
			
			div.appendChild(iframe);
			
			fragment.appendChild(span);
			fragment.appendChild(lineBreak);
			fragment.appendChild(div);
			
			return fragment;
		},
		
		hide: function(anchor) {
			var toEmbed = document.getElementById(anchor.id);
			var i = toEmbed.childNodes.length;
			var child;
			// iterate backwards as we are removing nodes
			while (i--) {
				child = toEmbed.childNodes[i];
				if (child.nodeName !== '#text'
					&& child.tagName !== 'SPAN') {
					toEmbed.removeChild(child);
				}
			}
			toEmbed.className = "youtube";
		}
	},
	
	snippet: {
		handler: function(ta, caret) {
			// detects keyword & replaces with snippet
			var text = ta.substring(0, caret);			
			var message = document.getElementsyName('message')[0];
			
			var words, word;
			
			if (text.indexOf(' ') > -1) {
				words = text.split(' ');
				word = words[words.length - 1];
				
				if (word.indexOf('\n') > -1) {
					// makes sure that line breaks are accounted for
					words = word.split('\n');
					word = words[words.length - 1];
				}
			}
			
			else if (text.indexOf('\n') > -1) {
				// line break(s) in text - no spaces
				words = text.split('\n');
				word = words[words.length - 1];
			}
			
			else {
				// first word in post
				word = text;
			}
			
			
			for (var key in messageList.config.snippet_data) {
				if (key === word) {
					var snippet = messageList.config.snippet_data[key];
					var index = text.lastIndexOf(word);
					var temp = text.substring(0, index);
					var ta = ta.replace(text, temp + snippet);
					message.value = ta;
					// manually move caret to end of pasted snippet as changing
					// message.value property moves caret to end of input)
					var newCaret = ta.lastIndexOf(snippet) + snippet.length;
					message.setSelectionRange(newCaret, newCaret);
				}
			}
		}	
	},
	
	usernotes: {
		open: function(el) {
			var userID = el.href.match(/note(\d+)$/i)[1];
			if (document.getElementById("notepage")) {
				var pg = document.getElementById('notepage');
				userID = pg.parentNode.getElementsByTagName('a')[0].href
						.match(/user=(\d+)$/i)[1];
				messageList.config.usernote_notes[userID] = pg.value;
				pg.parentNode.removeChild(pg);
				messageList.usernotes.save();
			} else {
				var note = messageList.config.usernote_notes[userID];
				page = document.createElement('textarea');
				page.id = 'notepage';
				page.value = (note == undefined) ? "": note;
				page.style.width = "100%";
				page.style.opacity = '.6';
				el.parentNode.appendChild(page);
			}
		},
		
		save: function() {
			messageList.sendMessage({
				need: "save",
				name: "usernote_notes",
				data: messageList.config.usernote_notes				
			});
		}
	},
	
	quote: {
		depth: 0,
		
		/**
		 *  Called after user uses feature which requires ETI markup to be generated
		 *  (archive quote buttons, like button, etc)
		 */
		
		handler: function(evt) {
			
			if (evt.likeButton) {
				var msgId = evt.id;
			}
			else {
				var msgId = evt.target.id;
			}
			
			var messageContainer = document.querySelector('[msgid="' + msgId + '"]');
			
			var markup = '<quote msgid="' + msgId + '">' + this.getMarkup(messageContainer) + '</quote>';
			
			if (this.depth !== 0) {
				console.log('Warning: quote depth not reset to 0');
				this.depth = 0;
			}
			
			
			if (evt.likeButton) {
				// Return output to likeButton.handler
				return markup;	
			}
			
			else {
				// Send markup to background page to be copied to clipboard				
				messageList.sendMessage({
					need: "copy",
					data: markup
				});
								
				this.showNotification(evt.target);
			}
		},
		
		showNotification: function(node) {
			// Create hidden notification so we can use fadeIn() later
			var span = document.createElement('span');
			span.id = 'copied';
			span.style.display = 'none';
			span.style.position = 'absolute';
			span.style.zIndex = 1;
			span.style.left = 100;
			span.style.backgroundColor = window.getComputedStyle(node.parentNode).backgroundColor;
			span.style.fontWeight = 'bold';
			span.innerHTML = '&nbsp[copied to clipboard]';
			
			node.appendChild(span);
						
			$("#copied").fadeIn(200);
				
			setTimeout(() => {
				
				$(node).find("span:last")
						.fadeOut(400);
						
			}, 1500);
			
			setTimeout(() => {
				
				node.removeChild(span);				
						
			}, 2000);
		},
		
		addButtons: function() {
			var hostname = window.location.hostname;
			var topicId = window.location.search.replace("?topic=", "");
			var container;
			var tops = [];
			var links = document.getElementsByTagName("a");
			var msgs = document.getElementsByClassName("message");
			var containers = document.getElementsByClassName("message-container");
			for (var i = 0, len = containers.length; i < len; i++) {
				var container = containers[i];
				tops[i] = container.getElementsByClassName("message-top")[0];
				var msgID = msgs[i].getAttribute("msgid");
				var quote = document.createElement("a");
				var quoteText = document.createTextNode("Quote");
				var space = document.createTextNode(" | ");
				quote.appendChild(quoteText);
				quote.href = "#";
				quote.id = msgID;
				quote.className = "archivequote";
				tops[i].appendChild(space);
				tops[i].appendChild(quote);
			}
		},				
		
		
		/**
		 *  Iterates of children of message element and generates markup.
		 *  Called recursively to handle quoted-message and spoiler elements.
		 */
		
		getMarkup: function(parentElement) {
			var output = '';
			var childNodes = parentElement.childNodes;
			
			for (var i = 0, len = childNodes.length; i < len; i++) {				
				var node = childNodes[i];
				if (node.nodeType === 3) {
					if (node.nodeValue.replace(/^\s+|\s+$/g, "") != '---') {	
						output += node.nodeValue;
					}
					else {
						// Stop processing post once we reach sig belt
						break;
					}
				}
											
				if (node.tagName) {
					if (node.tagName == 'B' || node.tagName == 'I' || node.tagName == 'U') {
						var tagName = node.tagName.toLowerCase(); 
						output += '<' + tagName + '>' + node.innerText + '</' + tagName + '>';
					}
					else if (node.tagName == 'A') {
						output += node.href;
					}
				}
				
				if (node.className) {
					switch (node.className) {
						case 'pr':
							output += '<pre>' + node.innerHTML.replace(/<br>/g, '') + '</pre>';		
							break;
							
						case 'imgs':
							var imgNodes = node.getElementsByTagName('A');
							for (var l = 0, img_len = imgNodes.length; l < img_len; l++) {
								var imgNode = imgNodes[l];
								output += '<img imgsrc="' + imgNode.getAttribute('imgsrc') + '" />' + '\n';
							}				
							break;
							
						case 'spoiler_closed':
							output += this.getMarkupFromSpoiler(node);
							break;
							
						case 'quoted-message':
							// getMarkup() is called recursively from inside getMarkupFromQuote(),
							// so this.depth can increase beyond 1 (depending on the level of nesting)
							this.depth++;
							output += this.getMarkupFromQuote(node);
							this.depth--;
							break;
						
						default:
							// If child node doesn't fit into any of these cases, we can just ignore it
							break;
					}
				}
			}
			
			return output;
		},
		
		getMarkupFromQuote: function(node) {
			var openQuote = '<quote>';
			var closeQuote = '</quote>';
			var msgId = node.attributes.msgid.value;
			if (msgId) {
				openQuote = '<quote msgid="' + msgId + '">';
			}						
			
			if (this.depth >= 2 && msgId) {
				// To match ETI behaviour when building markup, we have to omit quoted text if the quote depth 
				// reaches three levels of nesting. We should only do this if quote is attributed to another user
				return openQuote + closeQuote;	
			}
			
			else {
				return openQuote + this.getMarkup(node) + closeQuote;	
			}						
		},
				
		getMarkupFromSpoiler: function(node) {
			var openSpoiler = '<spoiler>';
			var closeSpoiler = '</spoiler>';					
			var spoiler = node.getElementsByClassName('spoiler_on_open')[0];					
			var caption = node.getElementsByClassName('caption')[0].innerText.replace(/<|\/>/g, '');
			// Caption element contains an added whitespace character at end
			caption = caption.slice(0, -1);
			
			// We only need to include caption if it doesn't match the default text
			if (caption && caption !== 'spoiler') {
				openSpoiler = '<spoiler caption="' + caption + '">';
			}

			// First and last elements of node list are part of the UI and should not be included in markup
			spoiler.removeChild(spoiler.firstChild);
			spoiler.removeChild(spoiler.lastChild);
			
			return openSpoiler + this.getMarkup(spoiler) + closeSpoiler;
		}		
		
	},
	
	image: {
		
		// originally rewritten by xdrvonscottx
		
		expand: function(evt) {
			var num_children = evt.target.parentNode.parentNode.childNodes.length;
			// first time expanding - only span
			if (num_children == 1) {
				// build new span
				var newspan = document.createElement('span');
				newspan.setAttribute("class", "img-loaded");
				newspan.setAttribute("id", evt.target.parentNode.getAttribute('id') + "_expanded");								

				var fullsize = evt.target.parentNode.parentNode.getAttribute('imgsrc');
				
				// set proper protocol
				if (window.location.protocol == "https:") {
					fullsize = fullsize.replace(/^http:/i, "https:");
				}
				
				// build new img child for our newspan
				var newimg = document.createElement('img');				
				newimg.src = fullsize;
				newspan.insertBefore(newimg, null);
				
				evt.target.parentNode.parentNode.insertBefore(newspan, evt.target.parentNode);
				evt.target.parentNode.style.display = "none"; // hide old img
			}
			
			// has been expanded before - just switch which node is hidden
			else if (num_children == 2) {
				// toggle their display statuses
				var children = evt.target.parentNode.parentNode.childNodes
				for (var i = 0; i < children.length; i++) {
					if (children[i].style.display == "none") {
						children[i].style.display = '';
					} else {
						children[i].style.display = "none";
					}
				}
			} 
			
			else if (messageList.config.debug) {
				console.log("Couldn't expand thumbnail - weird number of siblings");
			}
		},
		
		resize: function(el) {	
			var width = el.width;			
			if ((width * messageList.zoomLevel) > messageList.config.img_max_width) {
				// take zoom level into account when resizing images
				el.height = (el.height / (el.width / messageList.config.img_max_width) / messageList.zoomLevel);
				el.parentNode.style.height = el.height + 'px';
				el.width = messageList.config.img_max_width / messageList.zoomLevel;
				el.parentNode.style.width = el.width + 'px';
			}
		},
				
		observer: new MutationObserver((mutations) => {
			for (var i = 0; i < mutations.length; i++) {
				var mutation = mutations[i];
				if (messageList.config.resize_imgs) {
					messageList.image.resize(mutation.target.childNodes[0]);
				}
				if (mutation.type === 'attributes') {
					// once they're loaded, thumbnails have /i/t/ in their
					// url where fullsize have /i/n/
					if (mutation.attributeName == "class"
							&& mutation.target.getAttribute('class') == "img-loaded"
							&& /.*\/i\/t\/.*/.test(mutation.target.childNodes[0].src)) {
						/*
						 * set up the onclick and do some dom manip that the
						 * script originally did - i think only removing href
						 * actually matters
						 */
						mutation.target.parentNode.addEventListener('click',
								messageList.image.expand);
						mutation.target.parentNode.setAttribute('class',
								'thumbnailed_image');
						mutation.target.parentNode
								.setAttribute('oldHref',
										mutation.target.parentNode
												.getAttribute('href'));
						mutation.target.parentNode.removeAttribute('href');
					}
				}
			}
		})
	},
	
	spoilers: {
		find: function(el) {
			var spans = document.getElementsByClassName('spoiler_on_close');
			var node;
			for (var i = 0; spans[i]; i++) {
				node = spans[i].getElementsByTagName('a')[0];
				messageList.spoilers.toggle(node);
			}
		},
		
		toggle: function(obj) {
			while (!/spoiler_(?:open|close)/.test(obj.className)) {
				obj = obj.parentNode;
			}
			obj.className = obj.className.indexOf('closed') != -1 ? obj.className
					.replace('closed', 'opened'): obj.className.replace('opened',
					'closed');
			return false;
		}
	},
	
	links: {
		
		/**
		 *  Iterates over any posted links in topic so we can check for media that should be embedded
		 */
	
		check: function(msg) {
			var mediaToEmbed = false;
			var target = msg || document;
			
			var links = target.getElementsByClassName('l');
			
			if (links.length == 0) {
				return;
			}
			
			var i = links.length;
			var ytRegex = /youtube|youtu.be/;
			var videoCodeRegex = /^.*(youtu.be\/|v\/|u\/\w\/\/|watch\?v=|\&v=)([^#\&\?]*).*/;
			
			// Iterate backwards to prevent errors when modifying class of elements.
			while (i--) {
				var link = links[i];
				
				// Check for YouTube links and make sure they are videos
				if (messageList.config.embed_on_hover && ytRegex.test(link.href) && videoCodeRegex.test(link.href)) {
					link.className = 'youtube';
					// give each video link a unique id for embed/hide dom
					link.id = link.href + '&' + i;
					link.addEventListener('mouseenter', messageList.handleEvent.mouseenter.bind(messageList));
					link.addEventListener('mouseleave', messageList.handleEvent.mouseleave.bind(messageList));
				}
				
				// Check for Gfycat links
				else if ((messageList.config.embed_gfycat || messageList.config.embed_gfycat_thumbs) 
							&& link.title.indexOf('gfycat.com/') > -1) {
								
					link.classList.add('media', 'gfycat');
					mediaToEmbed = true;
					
					// Embed gfycat videos in quoted messages as thumbnails
					if (messageList.config.embed_gfycat_thumbs || link.parentNode.className == 'quoted-message') {
						link.setAttribute('name', 'gfycat_thumb');
					}
				}
				
				// Check for Imgur links
				else if ((messageList.config.embed_gfycat || messageList.config.embed_gfycat_thumbs) 
							&& link.title.indexOf('imgur.com/') > -1 && /.webm|.gifv|.gif/.test(link)) {
								
					link.classList.add('media', 'imgur');
					mediaToEmbed = true;

					if (messageList.config.embed_imgur_thumbs || link.parentNode.className == 'quoted-message') {
						link.setAttribute('name', 'imgur_thumb');
					}					
					
				}			
				
			}
			
			// Call mediaLoader to embed links which are visible in viewport
			if (mediaToEmbed) {
				messageList.mediaLoader();
				window.addEventListener('scroll', messageList.mediaLoader);
				document.addEventListener('visibilitychange', messageList.mediaPauser);
			}
			
		},
		
		
		/**
		 *  Fixes issue where certain types of relative URL on ETI would redirect to the wrong subdomain.
		 */
		
		fixRelativeUrls: function(anchor, type) {
			switch (type) {
				case 'wiki':
					window.open(anchor.href.replace('boards', 'wiki'));
					break;
				
				case 'imagemap':
					window.open(anchor.href.replace('boards', 'images'));
					break;
				
				case 'archives':
					window.open(anchor.href.replace('boards', 'archives'));
					break;
			}			
		}	
	},
	
	emojis: {
		
		/* Note:
				
				Generally emoji categories correspond to things like smileys, animals, food, etc
				'🔁' displays all emojis saved to config.emoji_history.
				'All' displays all emojis
				
		*/
		
		categories: ['🔁', '😃', '🐻', '🍆', '⚽', '🌇', '💡', '💯', '🚩', 'All'],
		
		addMenu: function() {
			var quickpostBody = document.getElementsByClassName('quickpost-body')[0];
			var emojiMenu = document.createElement('span');			
			emojiMenu.className = 'emoji_button';
			emojiMenu.innerHTML = ' 🙂 ';
			quickpostBody.insertBefore(emojiMenu, quickpostBody.getElementsByTagName('textarea')[0]);
		},
		
		toggleMenu: function(evt) {
			var menu = document.getElementsByClassName('emoji_menu')[0];
			
			if (menu) {
				document.body.removeChild(menu);
			}
			
			else {
				messageList.emojis.openMenu(evt);
			}
		},
		
		openMenu: function(evt) {
			var menu = document.createElement('div');
			var width = window.innerWidth;
			var height = window.innerHeight;
			
			// Create close button
			var close = document.createElement('div');
			close.id = "close_options";
			close.className = 'close';
			
			// Style main div			
			menu.style.width = (width * 0.95) + 'px';
			menu.style.height = (height * 0.4) + 'px';
			menu.style.left = (width - (width * 0.975)) + 'px';
			menu.style.top = (height - (height * 0.975)) + 'px';
			menu.className = "emoji_menu";
			
			var selector = document.createElement('div');
			selector.className = 'emoji_selector';
			
			var selectorList = document.createElement('ul');
			selectorList.className = 'emoji_selector_container';
			selectorList.append(document.createElement('br'));		
			
			for (var i = 0, len = this.categories.length; i < len; i++) {
				var category = this.categories[i];
				var element = document.createElement('li');
				element.innerHTML = category;
				element.id = category;
				element.className = 'emoji_type';
				selectorList.appendChild(element);				
			}
			
			selector.appendChild(selectorList);
			
			var display = document.createElement('div'); 
			display.className = 'emoji_display';
			
			display.appendChild(document.createElement('br'));
			
			menu.appendChild(close);
			menu.appendChild(selector);
			menu.appendChild(display);
			document.body.appendChild(menu);
			
			if (!messageList.config.emoji_history || messageList.config.emoji_history.length < 1) {
				this.displayCategory('😃');	
			}
			
			else {
				this.displayCategory('🔁');
			}
			
			document.body.addEventListener('click', this.menuCloseIntentCheck);			
		},
		
		/**
		 *  Recieves click events on document.body and decides whether to close emoji popup (based on likely user intent)
		 */
		
		menuCloseIntentCheck: function(evt) {
			// Weird edge cases that we should ignore
			if (evt.target.innerHTML === 'Your message must be at least 5 characters'
					|| evt.target.innerHTML === 'Know the rules! Mouse over the tags to learn more.') {						
				return;
			}							
			
			var targetClass = evt.target.className;
			
			// Close popup if user clicks outside of emoji menu, quickpost area, tag info popups,
			// or if user closes quickpost area by clicking on the quickpost-nub
			
			if (targetClass
					&& !/quickpost/.test(targetClass)
					&& !/emoji/.test(targetClass)
					&& !/tag/.test(targetClass)
					
					|| targetClass === 'quickpost-nub'
					|| targetClass === 'close') {							
											
				messageList.emojis.closeMenuFromListener();
				return;
			}
			
			var parent = evt.target.parentNode;			
			
			if (parent) {
				var parentClass = evt.target.parentNode.className;
			
				if (parentClass
						&& !/quickpost/.test(parentClass)
						&& !/emoji/.test(parentClass)
						&& !/tag/.test(parentClass)) {
						
					messageList.emojis.closeMenuFromListener();
					return;
				}
			}
			
			// Close popup if user clicks Post Message button			
			if (evt.target.getAttribute('name') === 'post') {
				messageList.emojis.closeMenuFromListener();
				return;
			}
			
			// Just remove the listener if user clicks on button which opens popup - toggleMenu() is called elsewhere
			if (targetClass === 'emoji_button') {				
				document.body.removeEventListener('click', messageList.emojis.menuCloseIntentCheck);
				return;
			}	
		},
		
		closeMenuFromListener: function() {
			document.body.removeEventListener('click', messageList.emojis.menuCloseIntentCheck);
			messageList.emojis.toggleMenu();			
		},
		
		selectEmoji: function(evt) {
			var quickreply = document.getElementsByTagName('textarea')[0];			
			var emoji = evt.target.innerHTML;
			
			// Insert emoji at caret position
			var caret = quickreply.selectionStart;
			
			quickreply.value = quickreply.value.substring(0, caret) 
					+ emoji 
					+ quickreply.value.substring(caret, quickreply.value.length);
			
			// Move caret to end of inserted emoji
			var endOfInsertion = caret + emoji.length;
			
			// We have to call setSelectionRange from inside setTimeout because of weird Chrome bug
			setTimeout(() => {
				quickreply.focus();
				quickreply.setSelectionRange(endOfInsertion, endOfInsertion);				
			}, 0);
			
			if (messageList.config.emoji_history.indexOf(emoji) === -1) {
				messageList.config.emoji_history.push(emoji);
				
				messageList.sendMessage({
					need: "save",
					name: "emoji_history",
					data: messageList.config.emoji_history
				});
			}	
		},
		
		clearHistory: function() {
			messageList.config.emoji_history = [];
			
			messageList.sendMessage({
				need: "save",
				name: "emoji_history",
				data: []
			});
			
			var display = document.getElementsByClassName('emoji_display')[0];
			display.innerHTML = '<br>';
			
			var clear = document.createElement('span');
			clear.innerHTML = 'Clear';
			clear.className = 'clear_emoji_history';
			display.appendChild(clear);			
		},				
		
		switchType: function(evt) {
			var oldSelection = document.getElementsByClassName('selected');
			oldSelection[0].classList.remove('selected');			
			this.displayCategory(evt.target.innerHTML);
		},
		
		displayAll: function() {
			var display = document.getElementsByClassName('emoji_display')[0];
			display.innerHTML = '<br>';
			
			for (var i = 0, len = this.categories.length; i < len; i++) {
				var category = this.categories[i];
				
				if (category !== 'All' && category !== '🔁') {
					var fragment = document.createDocumentFragment();
					var emojis = this.getEmojis(category);								
					
					for (var j = 0, len = emojis.length; j < len; j++) {
						var emoji = emojis[j];
						var element = document.createElement('span');
						element.innerHTML = emoji;
						element.className = 'emoji';
						fragment.appendChild(element);
					}
					
					display.appendChild(fragment);
				}						
			}
		},
		
		displayCategory: function(type) {
			var display = document.getElementsByClassName('emoji_display')[0];
			display.innerHTML = '<br>';
			
			var selectedType = document.getElementById(type);
			selectedType.classList.add('selected');			
			var emojis = this.getEmojis(type);
			var fragment = document.createDocumentFragment();
			for (var i = 0, len = emojis.length; i < len; i++) {
				var emoji = emojis[i];
				var element = document.createElement('span');
				element.innerHTML = emoji;
				element.id = emoji;
				element.className = 'emoji';
				fragment.appendChild(element);
			}
			
			if (type === '🔁') {
				var clear = document.createElement('span');
				clear.innerHTML = 'Clear';
				clear.className = 'clear_emoji_history';
				fragment.appendChild(clear);
			}
			
			display.appendChild(fragment);
		},				
		
		/**
		 *  Returns lists of emojis based on categories scraped from emojipedia.org
		 */
		
		getEmojis: function(type) {
			switch (type) {				
				case '🔁':
					return messageList.config.emoji_history;
				
				case '😃': 
					return ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎", "😍", "😘", "😗", "😙", "😚", "☺", "🙂", "🤗", "🤔", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮", "🤐", "😯", "😪", "😫", "😴", "😌", "🤓", "😛", "😜", "😝", "🤤", "😒", "😓", "😔", "😕", "🙃", "🤑", "😲", "☹", "🙁", "😖", "😞", "😟", "😤", "😢", "😭", "😦", "😧", "😨", "😩", "😬", "😰", "😱", "😳", "😵", "😡", "😠", "😇", "🤠", "🤡", "🤥", "😷", "🤒", "🤕", "🤢", "🤧", "😈", "👿", "👹", "👺", "💀", "👻", "👽", "🤖", "💩", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👦", "👧", "👨", "👩", "👴", "👵", "👶", "👼", "👮", "🕵", "💂", "👷", "👳", "👱", "🎅", "🤶", "👸", "🤴", "👰", "🤰", "👲", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🙇", "💆", "💇", "🚶", "🏃", "💃", "🕺", "👯", "🕴", "🗣", "👤", "👥", "👫", "👬", "👭", "💏", "👨‍❤️‍💋‍👨", "👩‍❤️‍💋‍👩", "💑", "👨‍❤️‍👨", "👩‍❤️‍👩", "👪", "👨‍👩‍👦", "👨‍👩‍👧", "👨‍👩‍👧‍👦", "👨‍👩‍👦‍👦", "👨‍👩‍👧‍👧", "👨‍👨‍👦", "👨‍👨‍👧", "👨‍👨‍👧‍👦", "👨‍👨‍👦‍👦", "👨‍👨‍👧‍👧", "👩‍👩‍👦", "👩‍👩‍👧", "👩‍👩‍👧‍👦", "👩‍👩‍👦‍👦", "👩‍👩‍👧‍👧", "👨‍👦", "👨‍👦‍👦", "👨‍👧", "👨‍👧‍👦", "👨‍👧‍👧", "👩‍👦", "👩‍👦‍👦", "👩‍👧", "👩‍👧‍👦", "👩‍👧‍👧", "💪", "🤳", "👈", "👉", "☝", "👆", "🖕", "👇", "✌", "🤞", "🖖", "🤘", "🖐", "✋", "👌", "👍", "👎", "✊", "👊", "🤛", "🤜", "🤚", "👋", "👏", "✍", "👐", "🙌", "🙏", "🤝", "💅", "👂", "👃", "👣", "👀", "👁", "👅", "👄", "💋", "👓", "🕶", "👔", "👕", "👖", "👗", "👘", "👙", "👚", "👛", "👜", "👝", "🎒", "👞", "👟", "👠", "👡", "👢", "👑", "👒", "🎩", "🎓", "⛑", "💄", "💍", "🌂", "☂", "💼"];
					
				case '🐻':
					return ["🙈", "🙉", "🙊", "💥", "💦", "💨", "💫", "🐵", "🐒", "🦍", "🐶", "🐕", "🐩", "🐺", "🦊", "🐱", "🐈", "🦁", "🐯", "🐅", "🐆", "🐴", "🐎", "🦄", "🐮", "🐂", "🐃", "🐄", "🐷", "🐖", "🐗", "🐽", "🐏", "🐑", "🐐", "🐪", "🐫", "🐘", "🦏", "🐭", "🐁", "🐀", "🐹", "🐰", "🐇", "🐿", "🦇", "🐻", "🐨", "🐼", "🐾", "🦃", "🐔", "🐓", "🐣", "🐤", "🐥", "🐦", "🐧", "🕊", "🦅", "🦆", "🦉", "🐸", "🐊", "🐢", "🦎", "🐍", "🐲", "🐉", "🐳", "🐋", "🐬", "🐟", "🐠", "🐡", "🐙", "🐚", "🦀", "🦐", "🦑", "🦋", "🐌", "🐛", "🐜", "🐝", "🐞", "🕷", "🕸", "🦂", "💐", "🌸", "💮", "🏵", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱", "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘", "🍀", "🍁", "🍂", "🍃", "🍄", "🌰", "🌍", "🌎", "🌏", "🌐", "🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘", "🌙", "🌚", "🌛", "🌜", "☀", "🌝", "🌞", "⭐", "🌟", "🌠", "☁", "⛅", "⛈", "🌤", "🌥", "🌦", "🌧", "🌨", "🌩", "🌪", "🌫", "🌬", "🌈", "☂", "☔", "⚡", "❄", "☃", "⛄", "☄", "🔥", "💧", "🌊", "🎄", "✨", "🎋", "🎍"];
				
				case '🍆':
					return ["🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🥝", "🍅", "🥑", "🍆", "🥔", "🥕", "🌽", "🌶", "🥒", "🍄", "🥜", "🌰", "🍞", "🥐", "🥖", "🥞", "🧀", "🍖", "🍗", "🍔", "🍟", "🍕", "🌭", "🌮", "🌯", "🍳", "🍲", "🥗", "🍿", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤", "🍥", "🍡", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🍫", "🍬", "🍭", "🍮", "🍯", "🍼", "🥛", "☕", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🍽", "🍴", "🥄"];
				
				case '⚽':
					return ["👾", "🕴", "🎪", "🎭", "🎨", "🎰", "🎗", "🎟", "🎫", "🎖", "🏆", "🏅", "🥇", "🥈", "🥉", "⚽", "⚾", "🏀", "🏐", "🏈", "🏉", "🎾", "🎱", "🎳", "🏏", "🏑", "🏒", "🏓", "🏸", "🥊", "🥋", "🎯", "⛳", "⛸", "🎣", "🎽", "🎿", "🏇", "⛷", "🏂", "🏌", "🏄", "🚣", "🏊", "⛹", "🏋", "🚴", "🚵", "🤸", "🤼", "🤽", "🤾", "🤹", "🎮", "🎲", "🎼", "🎤", "🎧", "🎷", "🎸", "🎹", "🎺", "🎻", "🥁", "🎬", "🏹"];
					
				case '🌇':
					return ["🗾", "🏔", "⛰", "🌋", "🗻", "🏕", "🏖", "🏜", "🏝", "🏞", "🏟", "🏛", "🏗", "🏘", "🏙", "🏚", "🏠", "🏡", "🏢", "🏣", "🏤", "🏥", "🏦", "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏯", "🏰", "💒", "🗼", "🗽", "⛪", "🕌", "🕍", "⛩", "🕋", "⛲", "⛺", "🌁", "🌃", "🌄", "🌅", "🌆", "🌇", "🌉", "🌌", "🎠", "🎡", "🎢", "🚂", "🚃", "🚄", "🚅", "🚆", "🚇", "🚈", "🚉", "🚊", "🚝", "🚞", "🚋", "🚌", "🚍", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚚", "🚛", "🚜", "🚲", "🛴", "🛵", "🏎", "🏍", "🚏", "🛤", "⛽", "🚨", "🚥", "🚦", "🚧", "⚓", "⛵", "🚤", "🛳", "⛴", "🛥", "🚢", "✈", "🛩", "🛫", "🛬", "💺", "🚁", "🚟", "🚠", "🚡", "🚀", "🛰", "🌠", "⛱", "🎆", "🎇", "🎑", "🚣", "💴", "💵", "💶", "💷", "🗿", "🛂", "🛃", "🛄", "🛅"];
					
				case '💡':
					return ["☠", "💌", "💣", "🕳", "🛍", "📿", "💎", "🔪", "🏺", "🗺", "💈", "🖼", "🛎", "🚪", "🛌", "🛏", "🛋", "🚽", "🚿", "🛀", "🛁", "⌛", "⏳", "⌚", "⏰", "⏱", "⏲", "🕰", "🌡", "⛱", "🎈", "🎉", "🎊", "🎎", "🎏", "🎐", "🎀", "🎁", "🕹", "📯", "🎙", "🎚", "🎛", "📻", "📱", "📲", "☎", "📞", "📟", "📠", "🔋", "🔌", "💻", "🖥", "🖨", "⌨", "🖱", "🖲", "💽", "💾", "💿", "📀", "🎥", "🎞", "📽", "📺", "📷", "📸", "📹", "📼", "🔍", "🔎", "🔬", "🔭", "📡", "🕯", "💡", "🔦", "🏮", "📔", "📕", "📖", "📗", "📘", "📙", "📚", "📓", "📃", "📜", "📄", "📰", "🗞", "📑", "🔖", "🏷", "💰", "💴", "💵", "💶", "💷", "💸", "💳", "✉", "📧", "📨", "📩", "📤", "📥", "📦", "📫", "📪", "📬", "📭", "📮", "🗳", "✏", "✒", "🖋", "🖊", "🖌", "🖍", "📝", "📁", "📂", "🗂", "📅", "📆", "🗒", "🗓", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "🖇", "📏", "📐", "✂", "🗃", "🗄", "🗑", "🔒", "🔓", "🔏", "🔐", "🔑", "🗝", "🔨", "⛏", "⚒", "🛠", "🗡", "⚔", "🔫", "🛡", "🔧", "🔩", "⚙", "🗜", "⚗", "⚖", "🔗", "⛓", "💉", "💊", "🚬", "⚰", "⚱", "🗿", "🛢", "🔮", "🚰", "🏁", "🚩", "🎌", "🏴", "🏳", "🏳️‍🌈"];
					
				case '💯':
					return ["💘", "❤", "💓", "💔", "💕", "💖", "💗", "💙", "💚", "💛", "💜", "🖤", "💝", "💞", "💟", "❣", "💤", "💢", "💬", "🗯", "💭", "💮", "♨", "💈", "🛑", "🕛", "🕧", "🕐", "🕜", "🕑", "🕝", "🕒", "🕞", "🕓", "🕟", "🕔", "🕠", "🕕", "🕡", "🕖", "🕢", "🕗", "🕣", "🕘", "🕤", "🕙", "🕥", "🕚", "🕦", "🌀", "♠", "♥", "♦", "♣", "🃏", "🀄", "🎴", "🔇", "🔈", "🔉", "🔊", "📢", "📣", "📯", "🔔", "🔕", "🎵", "🎶", "🏧", "🚮", "🚰", "♿", "🚹", "🚺", "🚻", "🚼", "🚾", "⚠", "🚸", "⛔", "🚫", "🚳", "🚭", "🚯", "🚱", "🚷", "🔞", "☢", "☣", "⬆", "↗", "➡", "↘", "⬇", "↙", "⬅", "↖", "↕", "↔", "↩", "↪", "⤴", "⤵", "🔃", "🔄", "🔙", "🔚", "🔛", "🔜", "🔝", "🛐", "⚛", "🕉", "✡", "☸", "☯", "✝", "☦", "☪", "☮", "🕎", "🔯", "♻", "📛", "🔰", "🔱", "⭕", "✅", "☑", "✔", "✖", "❌", "❎", "➕", "➖", "➗", "➰", "➿", "〽", "✳", "✴", "❇", "‼", "⁉", "❓", "❔", "❕", "❗", "©", "®", "™", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "⛎", "🔀", "🔁", "🔂", "▶", "⏩", "◀", "⏪", "🔼", "⏫", "🔽", "⏬", "⏹", "🎦", "🔅", "🔆", "📶", "📳", "📴", "#️⃣", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "💯", "🔠", "🔡", "🔢", "🔣", "🔤", "🅰", "🆎", "🅱", "🆑", "🆒", "🆓", "ℹ", "🆔", "Ⓜ", "🆕", "🆖", "🅾", "🆗", "🅿", "🆘", "🆙", "🆚", "🈁", "🈂", "🈷", "🈶", "🈯", "🉐", "🈹", "🈚", "🈲", "🉑", "🈸", "🈴", "🈳", "㊗", "㊙", "🈺", "🈵", "▪", "▫", "◻", "◼", "◽", "◾", "⬛", "⬜", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "💠", "🔲", "🔳", "⚪", "⚫", "🔴", "🔵", "👁‍🗨"];
					
				case '🚩':
					return ["🏁", "🚩", "🎌", "🏴", "🏳", "🏳️‍🌈", "🇦🇨", "🇦🇩", "🇦🇪", "🇦🇫", "🇦🇬", "🇦🇮", "🇦🇱", "🇦🇲", "🇦🇴", "🇦🇶", "🇦🇷", "🇦🇸", "🇦🇹", "🇦🇺", "🇦🇼", "🇦🇽", "🇦🇿", "🇧🇦", "🇧🇧", "🇧🇩", "🇧🇪", "🇧🇫", "🇧🇬", "🇧🇭", "🇧🇮", "🇧🇯", "🇧🇱", "🇧🇲", "🇧🇳", "🇧🇴", "🇧🇶", "🇧🇷", "🇧🇸", "🇧🇹", "🇧🇻", "🇧🇼", "🇧🇾", "🇧🇿", "🇨🇦", "🇨🇨", "🇨🇩", "🇨🇫", "🇨🇬", "🇨🇭", "🇨🇮", "🇨🇰", "🇨🇱", "🇨🇲", "🇨🇳", "🇨🇴", "🇨🇵", "🇨🇷", "🇨🇺", "🇨🇻", "🇨🇼", "🇨🇽", "🇨🇾", "🇨🇿", "🇩🇪", "🇩🇬", "🇩🇯", "🇩🇰", "🇩🇲", "🇩🇴", "🇩🇿", "🇪🇦", "🇪🇨", "🇪🇪", "🇪🇬", "🇪🇭", "🇪🇷", "🇪🇸", "🇪🇹", "🇪🇺", "🇫🇮", "🇫🇯", "🇫🇰", "🇫🇲", "🇫🇴", "🇫🇷", "🇬🇦", "🇬🇧", "🇬🇩", "🇬🇪", "🇬🇫", "🇬🇬", "🇬🇭", "🇬🇮", "🇬🇱", "🇬🇲", "🇬🇳", "🇬🇵", "🇬🇶", "🇬🇷", "🇬🇸", "🇬🇹", "🇬🇺", "🇬🇼", "🇬🇾", "🇭🇰", "🇭🇲", "🇭🇳", "🇭🇷", "🇭🇹", "🇭🇺", "🇮🇨", "🇮🇩", "🇮🇪", "🇮🇱", "🇮🇲", "🇮🇳", "🇮🇴", "🇮🇶", "🇮🇷", "🇮🇸", "🇮🇹", "🇯🇪", "🇯🇲", "🇯🇴", "🇯🇵", "🇰🇪", "🇰🇬", "🇰🇭", "🇰🇮", "🇰🇲", "🇰🇳", "🇰🇵", "🇰🇷", "🇰🇼", "🇰🇾", "🇰🇿", "🇱🇦", "🇱🇧", "🇱🇨", "🇱🇮", "🇱🇰", "🇱🇷", "🇱🇸", "🇱🇹", "🇱🇺", "🇱🇻", "🇱🇾", "🇲🇦", "🇲🇨", "🇲🇩", "🇲🇪", "🇲🇫", "🇲🇬", "🇲🇭", "🇲🇰", "🇲🇱", "🇲🇲", "🇲🇳", "🇲🇴", "🇲🇵", "🇲🇶", "🇲🇷", "🇲🇸", "🇲🇹", "🇲🇺", "🇲🇻", "🇲🇼", "🇲🇽", "🇲🇾", "🇲🇿", "🇳🇦", "🇳🇨", "🇳🇪", "🇳🇫", "🇳🇬", "🇳🇮", "🇳🇱", "🇳🇴", "🇳🇵", "🇳🇷", "🇳🇺", "🇳🇿", "🇴🇲", "🇵🇦", "🇵🇪", "🇵🇫", "🇵🇬", "🇵🇭", "🇵🇰", "🇵🇱", "🇵🇲", "🇵🇳", "🇵🇷", "🇵🇸", "🇵🇹", "🇵🇼", "🇵🇾", "🇶🇦", "🇷🇪", "🇷🇴", "🇷🇸", "🇷🇺", "🇷🇼", "🇸🇦", "🇸🇧", "🇸🇨", "🇸🇩", "🇸🇪", "🇸🇬", "🇸🇭", "🇸🇮", "🇸🇯", "🇸🇰", "🇸🇱", "🇸🇲", "🇸🇳", "🇸🇴", "🇸🇷", "🇸🇸", "🇸🇹", "🇸🇻", "🇸🇽", "🇸🇾", "🇸🇿", "🇹🇦", "🇹🇨", "🇹🇩", "🇹🇫", "🇹🇬", "🇹🇭", "🇹🇯", "🇹🇰", "🇹🇱", "🇹🇲", "🇹🇳", "🇹🇴", "🇹🇷", "🇹🇹", "🇹🇻", "🇹🇼", "🇹🇿", "🇺🇦", "🇺🇬", "🇺🇲", "🇺🇳", "🇺🇸", "🇺🇾", "🇺🇿", "🇻🇦", "🇻🇨", "🇻🇪", "🇻🇬", "🇻🇮", "🇻🇳", "🇻🇺", "🇼🇫", "🇼🇸", "🇽🇰", "🇾🇪", "🇾🇹", "🇿🇦", "🇿🇲", "🇿🇼", "🏴‍☠️", "🇽🇼", "🇽🇸", "🇽🇪"];
					
				case 'All':
					this.displayAll();
			}
		}
	},
	
	tcs: {
		getMessages: function() {
			if (!messageList.config.tcs)
				messageList.config.tcs = {};
			var tcs = [];
			var topic = window.location.href.match(/topic=(\d+)/)[1];
			var heads = document.getElementsByClassName('message-top');
			var tc;
			var haTopic;
			if (document.getElementsByClassName('message-top')[0].innerHTML
					.indexOf("> Human") !== -1) {
				haTopic = true;
				tc = "human #1";
			} else if ((!window.location.href.match('page') || window.location.href
					.match('page=1($|&)'))
					&& !window.location.href.match(/u=(\d+)/))
				tc = heads[0].getElementsByTagName('a')[0].innerHTML.toLowerCase();
			else {
				if (!messageList.config.tcs[topic] && messageList.config.debug) {
					console.log('Unknown TC!');
					return;
				}
				tc = messageList.config.tcs[topic].tc;
			}
			if (!messageList.config.tcs[topic]) {
				messageList.config.tcs[topic] = {};
				messageList.config.tcs[topic].tc = tc;
				messageList.config.tcs[topic].date = new Date().getTime();
			}
			for (var i = 0; i < heads.length; i++) {
				if (haTopic && heads[i].innerHTML.indexOf("\">Human") == -1) {
					heads[i].innerHTML = heads[i].innerHTML.replace(/Human #(\d+)/,
							"<a href=\"#" + i + "\">Human #$1</a>");
				}
				if (heads[i].getElementsByTagName('a')[0].innerHTML.toLowerCase() == tc) {
					tcs.push(heads[i]);
				}
			}
			messageList.tcs.save();
			return tcs;
		},
		
		save: function() {
			var max = 40;
			var lowest = Infinity;
			var lowestTc;
			var numTcs = 0;
			
			for (var i in messageList.config.tcs) {
				if (messageList.config.tcs[i].date < lowest) {
					lowestTc = i;
					lowest = messageList.config.tcs[i].date;
				}
				numTcs++;
			}
			
			if (numTcs > max) {
				delete messageList.config.tcs[lowestTc];
				
				messageList.sendMessage({
					need: "save",
					name: "tcs",
					data: messageList.config.tcs
				});
			}
		}	
	},
	
	likeButton: {
		
		/**
		 *  Checks whether user is posting in anonymous topic and builds markup for given post
		 *  after user clicks like button. The markup is either inserted at the start of the
		 *  quickpost area or at caret position, depending on whether user has typed anything or not
		 */
		
		buildMarkup: function(likeButtonElement, templateNumber) {
			var anonymous;
			var container = likeButtonElement.parentNode.parentNode;
			var message = likeButtonElement.parentNode.parentNode.getElementsByClassName('message')[0];
			var nub = document.getElementsByClassName('quickpost-nub')[0];
			var quickreply = document.getElementsByTagName('textarea')[0];
			
			
			// Get names of user and quoted poster
			if (document.getElementsByTagName('h2')[0].innerHTML.indexOf('href="/topics/Anonymous"') > -1) {
				anonymous = true;
				var user = "Human";
				var poster = "this";
			}
			
			else {
				var user = document.getElementsByClassName('userbar')[0]
						.getElementsByTagName('a')[0].innerHTML.replace(/ \((-?\d+)\)$/, "");
				var poster = container.getElementsByTagName('a')[0].innerHTML;
			}
			
			
			// Create like message
			var likeMessage;
			if (templateNumber) {
				likeMessage = messageList.config.custom_like_data[templateNumber].contents;
				likeMessage = likeMessage.replace('[user]', user);
				likeMessage = likeMessage.replace('[poster]', poster);
				
				if (anonymous) {
					// Kludgy grammar fix
					likeMessage = likeMessage.replace("this's", "this");
				}
			}
			
			else {				
				var img = '<img src="http://i4.endoftheinter.net/i/n/f818de60196ad15c888b7f2140a77744/like.png" />';
				if (anonymous) {
					likeMessage = img + ' Human likes this post';
				}
				else {
					likeMessage = img + ' ' + user + ' likes ' + poster + "'s post"; 
				}
			}
			
			// Generate markup from selected post and format text to insert
			var msgID = message.getAttribute('msgid');
			var quotedMessage = messageList.quote.handler({'id': msgID, 'likeButton': true});								
			var textToInsert = quotedMessage + '\n' + likeMessage;
			
			// If no other text has been added before sig belt, always insert text at beginning of textarea.
			// Fixes https://github.com/sonicmax/ChromeLL-2.0/issues/74
			var caret;
						
			// Check whether any text has been inserted before sig belt.
			// If user doesn't have a sig, it will always be inserted at caret position
			if (quickreply.value) {
				var message = quickreply.value.split('\n---')[0];
				if (message[0] === undefined) {
					// Insert at 0
					caret = 0;
				}								
			}
			
			if (caret !== 0) {
				// We can insert like message at caret position
				caret = quickreply.selectionStart;
			}			
			
			quickreply.value = quickreply.value.substring(0, caret) 
					+ textToInsert 
					+ quickreply.value.substring(caret, quickreply.value.length);						
			
			// Move caret to end of inserted text.
			var endOfInsertion = caret + textToInsert.length;
			
			// We have to call setSelectionRange from inside setTimeout because of weird Chrome bug
			setTimeout(() => {
				quickreply.focus();
				quickreply.setSelectionRange(endOfInsertion, endOfInsertion);
			}, 0);
			
			if (document.getElementsByClassName('regular quickpost-expanded').length == 0) {
				// quickpost area is hidden - click nub element to open
				nub.click();
			}
		},
		
		showOptions: function() {
			if (!document.getElementById('hold_menu')) {
				var likeData = messageList.config.custom_like_data;
				var menuElement = document.createElement('span');
				menuElement.id = 'hold_menu';	
				menuElement.style.position = 'absolute';
				menuElement.style.overflow = 'auto';
				menuElement.style.padding = '3px 3px';
				menuElement.style.borderStyle = 'solid';
				menuElement.style.borderWidth = '2px';
				menuElement.style.borderRadius = '3px';
				menuElement.style.backgroundColor = window.getComputedStyle(document.body).backgroundColor;
				for (var id in likeData) {
					var name = likeData[id].name;					
					populateMenu.call(this, name, id, menuElement);
				}
				messageList.cachedEvent.target.appendChild(menuElement);
			}
			
			function populateMenu(item, id, menuElement) {
				var menuSpan = document.createElement('span');
				var menuItem = document.createElement('anchor');
				var lineBreak = document.createElement('br');
				menuSpan.className = 'unhigh_span';
				menuItem.id = id;
				menuItem.innerHTML = '&nbsp' + item + '&nbsp';
				menuItem.href = '#like_custom_' + id;
				menuItem.className = 'like_button_custom';
				menuSpan.appendChild(menuItem);
				menuElement.appendChild(menuSpan);
				menuElement.appendChild(lineBreak);
			}
		},
		
		hideOptions: function() {
			var menu = document.getElementById('hold_menu');
			if (menu) {
				menu.remove();
			}
		}
	},
	
	
	/**
	 *  Makes sure that we only autoscroll if user is already at bottom of page 
	 *  (ie has finished reading current page and is waiting for new posts)
	 */
	
	autoscrollCheck: function(mutation) {
		// checks whether user has scrolled to bottom of page
		var position = mutation.getBoundingClientRect();
		if (mutation.style.display == 'none'
				|| position.top > window.innerHeight) {
			return false;
		} else {
			return true;
		}
	},
	
	startBatchUpload: function(evt) {
		var chosen = document.getElementById('batch_uploads');
		if (chosen.files.length == 0) {
			alert('Select files and then click "Batch Upload"');
			return;
		}
		document.getElementsByClassName('quickpost-body')[0]
				.getElementsByTagName('b')[0].innerHTML += " (Uploading: 1/"
				+ chosen.files.length + ")";
		allPages.asyncUpload(chosen.files, 0);
	},
	
	postTemplateAction: function(evt) {
		if (evt.className === "expand_post_template") {
			var ins = evt.parentNode;
			ins.removeChild(evt);
			var ia = document.createElement('a');
			ia.innerHTML = "&lt;"
			ia.className = "shrink_post_template";
			ia.href = '##';
			ins.innerHTML = '[';
			ins.insertBefore(ia, null);
			for ( var i in this.config.post_template_data) {
				var title = document.createElement('a');
				title.href = '##' + i;
				title.className = 'post_template_title';
				title.innerHTML = i;
				var titleS = document.createElement('span');
				titleS.style.paddingLeft = '3px';
				titleS.innerHTML = '[';
				titleS.insertBefore(title, null);
				titleS.innerHTML += ']';
				titleS.className = i;
				ins.insertBefore(titleS, null);
			}
			ins.innerHTML += ']';
		}
		if (evt.className === "shrink_post_template") {
			var ins = evt.parentNode;
			evt.parentNode.removeChild(evt);
			var ia = document.createElement('a');
			ia.innerHTML = "&gt;"
			ia.className = "expand_post_template";
			ia.href = '##';
			ins.innerHTML = '[';
			ins.insertBefore(ia, null);
			ins.innerHTML += ']';
		}
		if (evt.className === "post_template_title") {
			evt.id = 'post_action';
			var cdiv = document.getElementById('cdiv');
			var d = {};
			d.text = this.config.post_template_data[evt.parentNode.className].text;
			cdiv.innerHTML = JSON.stringify(d);
			cdiv.dispatchEvent(this.postEvent);
		}
	},	
	
	clearUnreadPostsFromTitle: function(evt) {
		if (!/\(\d+\+?\)/.test(document.title)
				|| this.autoscrolling == true
				|| document.hidden) {
			// do nothing
			return;
		}
		else if (/\(\d+\+?\)/.test(document.title)) {
			var newTitle = document.title.replace(/\(\d+\+?\) /, "");
			document.title = newTitle;
		}
	},
	
	
	/**
	 *  Handles quickpost HTML tag button events
	 */
	 
	qpTagButton: function(e) {
		if (e.target.tagName != 'INPUT') {
			return 0;
		}
		// from foxlinks
		var tag = e.target.id;
		var open = new RegExp("\\*", "m");
		var ta = document.getElementsByName('message')[0];
		var st = ta.scrollTop;
		var before = ta.value.substring(0, ta.selectionStart);
		var after = ta.value.substring(ta.selectionEnd, ta.value.length);
		var select = ta.value.substring(ta.selectionStart, ta.selectionEnd);

		if (ta.selectionStart == ta.selectionEnd) {
			if (open.test(e.target.value)) {
				e.target.value = e.target.name;
				var focusPoint = ta.selectionStart + tag.length + 3;
				ta.value = before + "</" + tag + ">" + after;
			} else {
				e.target.value = e.target.name + "*";
				var focusPoint = ta.selectionStart + tag.length + 2;
				ta.value = before + "<" + tag + ">" + after;
			}

			ta.selectionStart = focusPoint;
		} else {
			var focusPoint = ta.selectionStart + (tag.length * 2)
					+ select.length + 5;
			ta.value = before + "<" + tag + ">" + select + "</" + tag + ">"
					+ after;
			ta.selectionStart = before.length;
		}

		ta.selectionEnd = focusPoint;
		ta.scrollTop = st;
		ta.focus();
	},
	
	
	/**
	 *  Add event listeners required for ChromeLL features to work
	 */
	
	addListeners: function(message) {
		// make sure that these listeners are only added once
		if (!message) {
			document.body.addEventListener('click', this.handleEvent.mouseclick.bind(this));
			
			var searchBox = document.getElementById('image_search');			
			if (searchBox) {
				searchBox.addEventListener('keyup', this.handleEvent.search.bind(this));		
				document.addEventListener('keydown', this.handleEvent.keydown.bind(this));
			}
		}
		// these listeners should be added to every new post
		if (this.config.user_info_popup) {
			var tops;
			if (message) {
				tops = message.getElementsByClassName('message-top');
			} else {
				tops = document.getElementsByClassName('message-top');
			}
			for (var i = 0, len = tops.length; i < len; i++) {
				var top = tops[i];				
				var anchor = top.getElementsByTagName('a')[0];
				// ignore users in anon topics
				if (anchor.href.indexOf('http://endoftheinter.net/profile.php?user=') > -1) {
					anchor.className = 'username_anchor';
					anchor.addEventListener('mouseenter', this.handleEvent.mouseenter.bind(this));
					anchor.addEventListener('mouseleave', this.handleEvent.mouseleave.bind(this));
				}
			}
		}
	},
	
	appendScripts: function() {
		// TODO: there's really no reason that this has to be loaded from an external script
		var head = document.getElementsByTagName("head")[0];
		if (messageList.config.post_templates) {
			var templates = document.createElement('script');
			templates.type = 'text/javascript';
			templates.src = chrome.extension.getURL('src/js/topicPostTemplate.js');
			head.appendChild(templates);
		}
	},
	
	
	/**
	 *  Used to communicate with background page.
	 */
	
	sendMessage: function(message, callback) {
		
		try {		
			chrome.runtime.sendMessage(message, callback);
		} catch (e) {
			// Maybe there was an error in background page, or extension was updated and 
			// user hasn't refreshed page yet. We can't really do anything but log the error
			console.log('Error while sending message to background page:', message, e);
		}
		
	},
	
	
	/**
	 *  Creates a MutationObserver which observes topic and notifies user if a new page is created
	 */	 
	
	newPageObserver: new MutationObserver((mutations) => {
		for (var i = 0, len = mutations.length; i < len; i++) {
			var mutation = mutations[i];
			
			if (mutation.type === 'attributes' 
					&& mutation.target.style.display === 'block') {
				
				messageList.sendMessage({
					need: "notify",
					title: "New Page Created",
					message: document.title					
					
				});
			}
		}
	}),
	
	
	/**
	 *  Creates a MutationObserver which observes page for new livelinks posts and passes them to handler
	 */
	
	livelinksObserver: new MutationObserver((mutations) => {
		for (var i = 0, len = mutations.length; i < len; i++) {
			var mutation = mutations[i];
			if (mutation.addedNodes.length > 0
					&& mutation.addedNodes[0].childNodes.length > 0) {
				if (mutation.addedNodes[0].childNodes[0].className == 'message-container') {
					// send new message container to livelinks method
					messageList.handleEvent.newPost.call(messageList, mutation.addedNodes[0]);
				}
			}
		}
	}),
	
	
	/**
	 *  Crude method to detect zoom level for image resizing - we don't need to be completely accurate
	 */
	 
	 getZoomLevel: function() {
		var screenWidth = window.screen.width;
		var documentWidth = document.documentElement.clientWidth;
		this.zoomLevel = screenWidth / documentWidth;
	 },
	
	
	/**
	 *  The main loop for this script - called after DOMContentLoaded has fired (or otherwise once DOM is ready)
	 *  Applies various types of DOM modifications to the message list, adds listeners for ChromeLL features, etc
	 */
	
	applyDomModifications: function(pm) {	
		// Call methods which modify infobar element
		for (var k in this.dom.infobar) {
			if (this.config[k + pm]) {
				this.dom.infobar[k]();
			}
		}
		
		// Check whether user can post in topic
		var topicOpen = (document.getElementsByClassName('quickpost').length > 0);
		
		if (!topicOpen) {
			// Add ChromeLL quote buttons before highlights/post numbers are added
			this.quote.addButtons();
			
			// Delete unusable methods
			delete this.dom.messagecontainer.like_button;
			delete this.dom.messagecontainer.post_templates;			
		}	
		
		// Iterate over first 5 message-containers.
		// TODO: do we really need to unroll this loop
		var msgs = document.getElementsByClassName('message-container');
		var len;
		
		if (msgs.length < 4) {
			len = msgs.length;
		}
		
		else {
			len = 4;
		}
		
		// Iterate over message-containers, check config value and pass elements to each function
		for (var j = 0; j < len; j++) {
			var msg = msgs[j];
			var top = msg.getElementsByClassName('message-top')[0];

			for (var k in this.dom.messagecontainer) {			
				if (this.config[k + pm]) {
					this.dom.messagecontainer[k](msg, top, j + 1);
				}
			}
		}
		
		// Append dramalinks ticker to page
		var titleElement = document.getElementsByTagName('h2')[0];	
		if (this.config.dramalinks && !this.config.hide_dramalinks_topiclist) {
			dramalinks.appendTo(titleElement);
			
			// Modify existing margin-top value (-39px) of pascal so that it appears above ticker
			var offset = -39 - document.getElementById('dramalinks_ticker').getBoundingClientRect().height;
			document.styleSheets[0].insertRule("img[src='//static.endoftheinter.net/pascal.png'] { margin-top: " + offset + "px !important; }", 1);			
		}
		
		// Iterate over rest of messages
		if (len == 4) {			
			for (var j = 4, len = msgs.length; j < len; j++) {
				var msg = msgs[j];
				var top = msg.getElementsByClassName('message-top')[0];
				
				for (var k in this.dom.messagecontainer) {
					if (this.config[k + pm]) {
						this.dom.messagecontainer[k](msg, top, j + 1);
					}
				}
			}
		}
		
		// Pass updated ignorator data to background page so we can update badge and popup menu
		if (!this.config.hide_ignorator_badge) {
			this.globalPort.postMessage({
					action: 'ignorator_update',
					ignorator: this.ignorated,
					scope: "messageList"
			});
		}
		
		// Finish modifying visible DOM
		for (var i in this.dom.misc) {
			if (this.config[i + pm]) {
				this.dom.misc[i]();
			}
		}
		
		if (topicOpen) {
			// Call methods which modify quickpost area (user probably won't see this)
			for (var i in this.dom.quickpostbody) {
				if (this.config[i + pm]) {
					this.dom.quickpostbody[i]();
				}
			}
			
			// Check whether we need to restore quickpost contents
			if (sessionStorage.getItem('quickpost_value') !== null) {
				var quickpost = document.getElementsByName('message')[0];
				
				quickpost.value = sessionStorage.getItem('quickpost_value');				
				
				setTimeout(() => {
					var caret = sessionStorage.getItem('quickpost_caret_position');
					quickpost.setSelectionRange(caret, caret);
				}, 0);
				
				sessionStorage.removeItem('quickpost_value');
				sessionStorage.removeItem('quickpost_caret_position');
			}
		}
		
		// Check whether we need to restore scroll position
		if (sessionStorage.getItem('scrollx') !== null) {
			window.scrollX = sessionStorage.getItem('scrollx');
			window.scrollY = sessionStorage.getItem('scrolly');
			sessionStorage.removeItem('scrollx');
			sessionStorage.removeItem('scrolly');
		}
		
		// Check anchors for media links to embed, etc
		this.links.check();
		this.addListeners();
		this.appendScripts();
		
		// Add livelinks listeners	
		this.livelinksObserver.observe(document.getElementById('u0_1'), {
				subtree: true,
				childList: true
		});
		
		if (this.config.new_page_notify) {
			this.newPageObserver.observe(document.getElementById('nextpage'), {
					attributes: true
			});
		}
	},

	/**
	 *  Converts ignorator string to array and removes any whitelisted users
	 */
	
	prepareIgnoratorArray: function() {
		this.ignoredUsers = this.config.ignorator_list.split(',').map((user) => {
			return user.trim();
		});
		
		if (this.config.ignorator_allow_posts && this.config.ignorator_post_whitelist) {
			
			var whitelist = this.config.ignorator_post_whitelist.split(',').map((user) => {
				return user.trim().toLowerCase(); 
			});
			
			this.ignoredUsers = this.ignoredUsers.filter((user) => {
				return (whitelist.indexOf(user.toLowerCase()) === -1);				
			});
		}
	}
};

// Entry point
chrome.runtime.sendMessage({
	
	need: "config",
	tcs: true
	
}, (config) => {
	messageList.init.call(messageList, config);
});