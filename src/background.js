
    var audio = document.querySelector('audio');
    var helper = document.querySelector('#helper');
    var isPlay = false;
    var isRepeat = false;
    var playList = [];
    var h = [];
    var current = 0;
    var time = 0;
    var canplaythrough = false;
    var p = null;
	var likedSongs = [];

    oauth(function () {});

	localStorage.channel || (localStorage.channel = '0');


    audio.addEventListener('loadstart', function () {
        canplaythrough = false;
        p && p.postMessage({cmd: 'canplaythrough', status: false});
    },false);

    audio.addEventListener('canplaythrough', function () {
        canplaythrough = true;
        p && p.postMessage({cmd: 'canplaythrough', status: true});
        if (!playList[current + 1]) {
            fetchSongs();
        }
    },false);

    audio.addEventListener('timeupdate', function () {
        var currentTime = Math.floor(audio.currentTime);
        if (currentTime > time) {
            time = currentTime;
            if(p) {p.postMessage({cmd: 'progress', time: time, length: Math.floor(audio.duration)});}
        }
    },false);

    audio.addEventListener('ended', function () {
        if (!isRepeat) {
            if (localStorage.channel !== '-1') {h.push('|' + playList[current].sid + ':p');}
            current += 1;
            audio.src = playList[current].url;
        }
        time = 0;
        audio.play();
        if (p) {p.postMessage(getCurrentSongInfo());}
    }, false);

    chrome.extension.onConnect.addListener(function(port) {
        if (port.name === 'fm') {
            p = port;
            port.onMessage.addListener(function (msg, port) {
                switch (msg.cmd) {
                case 'switch':
                    isPlay = msg.isPlay;
                    if (msg.isPlay) {
                        if (playList.length) {
                            audio.play();
                        }
                    }
                    else {
                        audio.pause();
                    }
                    break;
                case 'next':
					if (localStorage.channel !== '-1') {h.push('|' + playList[current].sid + ':s');}

                    if (playList[current + 1]) {
                        current += 1;
                        audio.src = playList[current].url;
                        audio.play();
                        time = 0;
                        port.postMessage(getCurrentSongInfo());
                    }
                    else {
                        fetchSongs(function () {
                            current += 1;
                            audio.src = playList[current].url;
                            audio.play();
                            time = 0;
                            port.postMessage(getCurrentSongInfo());
                        });
                    }
                    break;
                case 'prev':
                    if (current) {
                        current -= 1;
                        audio.src = playList[current].url;
                        audio.play();
                        time = 0;
                    }
                    port.postMessage(getCurrentSongInfo());
                    break;
                case 'index':
                    current = msg.index;
                    audio.src = playList[current].url;
                    audio.play();
                    time = 0;
                    port.postMessage(getCurrentSongInfo());
                    break;
                case 'volume':
                    audio.volume = msg.value / 100;
                    break;
                case 'repeat':
                    isRepeat = msg.status;
                    break;
                case 'love':
                    if (msg.status) {
                        h.push('|' + playList[current].sid + ':r');
                        playList[current].like = '1';
                    }
                    else {
                        h.push('|' + playList[current].sid + ':u');
                        playList[current].like = '0';
                    }
                    fetchSongs();
                    h.pop();
                    break;
                case 'trash':
                    h.push('|' + playList[current].sid + ':b');
                    fetchSongs();
                    h.pop();
                    playList.splice(current, 1);

                    if (playList[current]) {
                        audio.src = playList[current].url;
                        audio.play();
                        time = 0;
                        port.postMessage(getCurrentSongInfo());
                    }
                    else {
                        current -= 1;
                        fetchSongs(function () {
                            current += 1;
                            audio.src = playList[current].url;
                            audio.play();
                            time = 0;
                            port.postMessage(getCurrentSongInfo());
                        });
                    }
                    break;
                case 'get':
                    if (playList.length) {
                        port.postMessage(getCurrentSongInfo());
                    }
                    else {
                        fetchSongs(function () {
                            audio.src = playList[0].url;
                            if (isPlay) {audio.play();}
                            port.postMessage(getCurrentSongInfo());
                        });
                    }
                    break;
                case 'channel':
                    audio.pause();
                    playList = playList.slice(0, current+1);
                    fetchSongs(function () {
                        current += 1;
                        audio.src = playList[current].url;
                        if (isPlay) {audio.play();}
                        port.postMessage(getCurrentSongInfo());
                    });
                    break;
                }
            });

            port.onDisconnect.addListener(function (port) {
                if (port.name === 'fm') {
                    p = null;
                }
            });
        }
    });

    function getCurrentSongInfo() {
        var song = playList[current], info = {cmd: 'set'};
        info.title = song.title;
        info.artist = song.artist;
        info.album = song.album;
        info.albumtitle = song.albumtitle;
        info.picture = song.picture;
        info.like = song.like;
        info.time = time;
        info.length = Math.floor(audio.duration);
        info.isPlay = isPlay;
        info.isRepeat = isRepeat;
        info.volume = audio.volume;
        info.canplaythrough = canplaythrough;
		info.current = current;
		info.list = playList;
        return info;
    }

    function fetchSongs(fn) {
        var channel = localStorage.channel;
		if (channel === '-1') {
			likedFm(fn);
		}
		else {
        var r = rand();
        h = h.slice(-20);
        ajax(
            'get',
            'http://douban.fm/j/mine/playlist',
            h.length ? 'type=s&sid='+ h[h.length - 1].slice(1, -2) +'&h='+ h.join('') +'&channel='+channel+'&from=mainsite&r='+r : 'type=n&h=&channel='+channel+'&from=mainsite&r='+r,
            10000,
            function (client) {
                client = JSON.parse(client.responseText);
                for (var i = 0, len = client.song.length ; i < len ; i += 1) {
                    if (/^\d+$/.test(client.song[i].sid)) {
                        client.song[i].picture = client.song[i].picture.replace('mpic', 'lpic');
						client.song[i].url = 'http://otho.douban.com/view/song/small/p'+client.song[i].sid+'.mp3';
						client.song[i].album = 'http://music.douban.com'+client.song[i].album;
                        playList.push(client.song[i]);
                    }
                }
                fn && fn();
            },
            function (client) {
                if (p) {p.postMessage({cmd: 'error'})}
            }
        );
		}
    }

	function likedFm(fn) {
		if (likedSongs.length) {
			for (var i = 0, len = likedSongs.length < 5 ? likedSongs.length : 5, song ; i < len ; i += 1) {
				playList.push(likedSongs[Math.floor(Math.random() * likedSongs.length)]);
			}
			fn && fn();
		}
		else {
			fetchLikedSongs(function () {
				for (var i = 0, len = likedSongs.length < 5 ? likedSongs.length : 5, song ; i < len ; i += 1) {
					playList.push(likedSongs[Math.floor(Math.random() * likedSongs.length)]);
				}
				fn && fn();
			});
		}
	}

	function fetchLikedSongs(fn) {
		var index = 0;
		fetch(0)
		function fetch(index) {
			ajax(
				'get',
				'http://douban.fm/mine',
				'type=liked&start=' + index,
				10000,
				function (client) {
					likedSongsParser.innerHTML = client.responseText.match(/(<div id="record_viewer">[\s\S]+)<div class="paginator">/m)[1].replace(/onload="reset_icon_size\(this\);"/gm, '');
					var songs = likedSongsParser.querySelectorAll('.info_wrapper');
					for (var i = 0, len = songs.length, song ; i < len ; i += 1) {
						song = songs[i];
						var item = {};
						item.album = song.querySelector('a').href;
						item.picture = song.querySelector('img').src.replace('spic', 'lpic');
						item.title = song.querySelector('.song_title').innerHTML;
						item.artist = song.querySelector('.performer').innerHTML;
						item.albumtitle = song.querySelector('.source a').innerHTML;
						item.sid = song.querySelector('.action').getAttribute('sid');
						item.url = 'http://otho.douban.com/view/song/small/p'+item.sid+'.mp3';
						item.like = '1';
						likedSongs.push(item);
					}
					likedSongsParser.innerHTML = '';
					if (index === 0 && fn) {fn();}
					if (len === 15) {
						setTimeout(function () {
							index += 15;
							fetch(index);
						}, 1000);
					}
				},
				function (client) {
					if (p) {p.postMessage({cmd: 'error'})}
				}
			);
		}
	}

    function ajax(method, url, data, timeout, success, error) {
        var client = new XMLHttpRequest(), data, isTimeout = false, self = this;
        method = method.toLowerCase();
        if (typeof data === 'object') {
            data = stringify(data);
        }
        if (method === 'get' && data) {
            url += '?' + data;
            data = null;
        }
        client.onload = function () {
            if (!isTimeout && ((client.status >= 200 && client.status < 300) || client.status == 304)) {
                success(client);
            }
            else {
                error(client);
            }
        };
        client.open(method, url, true);
        method === 'post' && client.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        client.setRequestHeader('ajax', 'true');
        client.send(data);
        setTimeout(function () {isTimeout = true;}, timeout);
    };

    function rand() {
        var charset = '1234567890abcdef', str = '', i;
        for (i = 0 ; i < 10 ; i += 1) {
            str += charset.charAt(Math.floor(Math.random() * 16));
        }
        return str;
    }
