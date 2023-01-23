import UnsplashImage from './types/unsplashImage'
import { Local, DynamicCache, Quote } from './types/local'
import { Sync, Searchbar, Weather, Hide, Dynamic, MoveKeys } from './types/sync'

import { dict, enginesLocales, enginesUrls } from './lang'
import { settingsInit } from './settings'

import notes from './features/notes'
import clock from './features/clock'
import weather from './features/weather'
import moveElements from './features/move'
import customFont from './features/fonts'
import quickLinks from './features/quicklinks'

import storage from './storage'

import {
	$,
	clas,
	bundleLinks,
	detectPlatform,
	errorMessage,
	extractHostname,
	getBrowser,
	getFavicon,
	localDefaults,
	minutator,
	mobilecheck,
	periodOfDay,
	randomString,
	stringMaxSize,
	syncDefaults,
	testOS,
	tradThis,
	turnRefreshButton,
	validateHideElem,
	eventSyncSetDebounce,
} from './utils'

let loadBis = false
const eventDebounce = eventSyncSetDebounce

const freqControl = {
	set: () => {
		return new Date().getTime()
	},

	get: (every: string, last: number) => {
		// instead of adding unix time to the last date
		// look if day & hour has changed
		// because we still cannot time travel
		// changes can only go forward

		const nowDate = new Date()
		const lastDate = new Date(last || 0)
		const changed = {
			date: nowDate.getDate() !== lastDate.getDate(),
			hour: nowDate.getHours() !== lastDate.getHours(),
		}

		switch (every) {
			case 'day':
				return changed.date

			case 'hour':
				return changed.date || changed.hour

			case 'tabs':
				return true

			case 'pause':
				return last === 0

			case 'period': {
				const sun = sunTime()
				return last === 0 || !sun ? true : periodOfDay(sun) !== periodOfDay(sun, +lastDate) || false
			}

			default:
				return false
		}
	},
}

export function toggleWidgets(list: { [key in 'quicklinks' | 'notes' | 'quotes' | 'searchbar']?: boolean }, fromInput?: true) {
	//
	// Update Display
	//

	const doms = {
		quicklinks: 'linkblocks',
		notes: 'notes_container',
		quotes: 'quotes_container',
		searchbar: 'sb_container',
	}

	const inputs = {
		notes: 'i_notes',
		quotes: 'i_quotes',
		searchbar: 'i_sb',
		quicklinks: 'i_quicklinks',
	}

	Object.entries(list).forEach(([key, on]) => {
		clas($(key + '_options'), on, 'shown')

		// This hides interface while grid is changing to avoid flickering
		// Todo: This is an ugly hack and there must be a better way
		dominterface.style.opacity = '0'
		setTimeout(() => {
			clas($(doms[key as keyof typeof doms]), !on, 'hidden')
			dominterface.style.opacity = '1'
		}, 5)

		if (!fromInput) {
			;($(inputs[key as keyof typeof inputs]) as HTMLInputElement).checked = on
		}
	})

	//
	// Update Storage
	//

	storage.sync.get(['quicklinks', 'notes', 'quotes', 'searchbar'], (data) => {
		let statesToSave: { [key: string]: unknown } = {}

		if ('quicklinks' in list) statesToSave.quicklinks = list.quicklinks
		if ('notes' in list) statesToSave.notes = { ...data.notes, on: list.notes }
		if ('quotes' in list) statesToSave.quotes = { ...data.quotes, on: list.quotes }
		if ('searchbar' in list) statesToSave.searchbar = { ...data.searchbar, on: list.searchbar }

		storage.sync.set({ ...statesToSave })
	})

	//
	// Update grid
	//

	if (fromInput) {
		const [id, on] = Object.entries(list)[0]
		moveElements(null, { widget: { id: id as MoveKeys, on } })
	}
}

export function traduction(settingsDom: Element | null, lang = 'en') {
	type DictKey = keyof typeof dict
	type DictField = keyof typeof dict.April // "april" just to select a random field

	if (!Object.keys(dict.April).includes(lang)) {
		return // Is english or not valid lang code ? keep english (do nothing)
	}

	const trns = (settingsDom ? settingsDom : document).querySelectorAll('.trn')
	const dictKeys = Object.keys(dict)
	let text: string

	trns.forEach((trn) => {
		if (trn.textContent) {
			text = trn.textContent

			// Translate if text is a valid dict key
			// lang is de facto a valid dict[...] key because it didnt return before
			if (dictKeys.includes(text)) {
				trn.textContent = dict[text as DictKey][lang as DictField]
			}
		}
	})

	document.documentElement.setAttribute('lang', lang)
}

export function favicon(init: string | null, event?: HTMLInputElement) {
	function createFavicon(emoji: string) {
		const svg = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="85">${emoji}</text></svg>`
		document.querySelector("link[rel~='icon']")?.setAttribute('href', emoji ? svg : `src/assets/${getFavicon()}`)
	}

	if (init !== undefined && init !== null) {
		createFavicon(init)
	}

	if (event) {
		const val = event.value
		const isEmoji = val.match(/\p{Emoji}/gu) && !val.match(/[0-9a-z]/g)

		if (isEmoji) createFavicon(val)
		else event.value = ''

		eventDebounce({ favicon: isEmoji ? val : '' })
	}
}

export function tabTitle(init: string | null, event?: HTMLInputElement) {
	const title = init ? init : event ? stringMaxSize(event.value, 80) : tradThis('New tab')

	if (event) {
		eventDebounce({ tabtitle: title })
	}

	document.title = title
}

export async function linksImport() {
	const closeBookmarks = (container: HTMLElement) => {
		container.classList.add('hiding')
		setTimeout(() => container.setAttribute('class', ''), 400)
	}

	function main(links: Link[], bookmarks: chrome.bookmarks.BookmarkTreeNode[]): void {
		const listdom = document.createElement('ol')

		let bookmarksList: chrome.bookmarks.BookmarkTreeNode[] = []
		let selectedList: string[] = []

		bookmarks[0].children?.forEach((cat) => {
			const list = cat.children

			if (Array.isArray(list)) {
				bookmarksList.push(...list)
			}
		})

		function selectBookmark(elem: HTMLLIElement) {
			const isSelected = elem.classList.toggle('selected')
			const index = elem.getAttribute('data-index')
			let counter = listdom.querySelectorAll('li.selected').length

			if (!index) return

			// update list to return
			isSelected ? selectedList.push(index) : selectedList.pop()

			// Change submit button text & class on selections
			if (counter === 0) $('bmk_apply')!.textContent = tradThis('Select bookmarks to import')
			if (counter === 1) $('bmk_apply')!.textContent = tradThis('Import this bookmark')
			if (counter > 1) $('bmk_apply')!.textContent = tradThis('Import these bookmarks')

			clas($('bmk_apply'), counter === 0, 'none')
		}

		bookmarksList.forEach((mark, index) => {
			const elem = document.createElement('li')
			const titleWrap = document.createElement('p')
			const title = document.createElement('span')
			const favicon = document.createElement('img')
			const url = document.createElement('pre')
			const markURL = mark.url

			// only append links if url are not empty
			// (temp fix to prevent adding bookmarks folder title ?)
			if (!markURL || markURL === '') {
				return
			}

			favicon.src = 'https://icons.duckduckgo.com/ip3/' + extractHostname(markURL) + '.ico'
			favicon.alt = ''

			title.textContent = mark.title
			url.textContent = markURL

			titleWrap.appendChild(favicon)
			titleWrap.appendChild(title)

			elem.setAttribute('data-index', index.toString())
			elem.setAttribute('tabindex', '0')
			elem.appendChild(titleWrap)
			elem.appendChild(url)

			elem.onclick = () => selectBookmark(elem)
			elem.onkeydown = (e: KeyboardEvent) => (e.code === 'Enter' ? selectBookmark(elem) : '')

			if (links.filter((x) => x.url === stringMaxSize(markURL, 512)).length === 0) {
				listdom.appendChild(elem)
			}
		})

		// Replace list to filter already added bookmarks
		const oldList = document.querySelector('#bookmarks ol')
		if (oldList) oldList.remove()
		$('bookmarks')!.prepend(listdom)

		// Just warning if no bookmarks were found
		if (bookmarksList.length === 0) {
			clas($('bookmarks'), true, 'noneFound')
			return
		}

		// Submit event
		$('bmk_apply')!.onclick = function () {
			let bookmarkToApply = selectedList.map((i) => ({
				title: bookmarksList[parseInt(i)].title,
				url: bookmarksList[parseInt(i)].url || '',
			}))

			if (bookmarkToApply.length > 0) {
				closeBookmarks($('bookmarks_container')!)
				quickLinks(null, { is: 'import', bookmarks: bookmarkToApply })
			}
		}

		const lidom = document.querySelector('#bookmarks ol li') as HTMLLIElement
		lidom.focus()
	}

	// Ask for bookmarks first
	chrome.permissions.request({ permissions: ['bookmarks'] }, (granted) => {
		if (!granted) return

		storage.sync.get(null, (data) => {
			const extAPI = window.location.protocol === 'moz-extension:' ? browser : chrome
			extAPI.bookmarks.getTree().then((response) => {
				clas($('bookmarks_container'), true, 'shown')
				main(bundleLinks(data as Sync), response)
			})
		})
	})

	// Close events
	$('bmk_close')!.onclick = () => closeBookmarks($('bookmarks_container')!)

	$('bookmarks_container')!.addEventListener('click', function (e: MouseEvent) {
		if ((e.target as HTMLElement).id === 'bookmarks_container') closeBookmarks(this)
	})
}

export function initBackground(data: Sync) {
	const type = data.background_type || 'dynamic'
	const blur = data.background_blur
	const bright = data.background_bright

	backgroundFilter('init', { blur, bright })

	if (type === 'custom') {
		localBackgrounds({ every: data.custom_every, time: data.custom_time })
		return
	}

	unsplash(data)
}

export function imgBackground(url: string, color?: string) {
	const overlaydom = $('background_overlay') as HTMLDivElement
	const backgrounddom = $('background') as HTMLDivElement
	const backgroundbisdom = $('background-bis') as HTMLDivElement
	let img = new Image()

	img.onload = () => {
		if (loadBis) {
			backgrounddom.style.opacity = '0'
			backgroundbisdom.style.backgroundImage = `url(${url})`
		} else {
			backgrounddom.style.opacity = `1`
			backgrounddom.style.backgroundImage = `url(${url})`
		}

		overlaydom.style.opacity = '1'
		loadBis = !loadBis
		localIsLoading = false

		if (color && testOS.ios) {
			setTimeout(() => document.documentElement.style.setProperty('--average-color', color), 400)
		}
	}

	img.src = url
	img.remove()
}

export function localBackgrounds(
	init: { every: string; time: number } | null,
	event?: {
		is: string
		settings?: HTMLElement
		button?: HTMLSpanElement
		file?: FileList
	}
) {
	// Storage needs to be flat, as to only ask for needed background
	// SelectedId is self explanatory
	// CustomIds is list to get amount of backgrounds without accessing them
	// storage.local = {
	// 	  `full${_id}`: "/9j/4AAQSkZJRgAB...",
	// 	  `thumb${_id}`: "/9j/4AAQSkZJRgAB...",
	// 	  idsList: [ _id1, _id2, _id3 ],
	//    selectedId: _id3
	// }

	function isOnlineStorageAtCapacity(newFile: string) {
		//
		// Only applies to versions using localStorage: 5Mo limit
		if (detectPlatform() === 'online') {
			const ls = localStorage.bonjourrBackgrounds

			// Takes dynamic cache + google font list
			const potentialFontList = JSON.parse(ls).googleFonts ? 0 : 7.6e5
			const lsSize = ls.length + potentialFontList + 10e4

			// Uploaded file in storage would exceed limit
			if (lsSize + newFile.length > 5e6) {
				alert(`Image size exceeds storage: ${Math.abs(lsSize - 5e6) / 1000}ko left`)

				return true
			}
		}

		return false
	}

	function b64toBlobUrl(b64Data: string, callback: Function) {
		fetch(`data:image/jpeg;base64,${b64Data}`).then((res) => {
			res.blob().then((blob) => callback(URL.createObjectURL(blob)))
		})
	}

	function thumbnailSelection(id: string) {
		document.querySelectorAll('.thumbnail').forEach((thumb) => clas(thumb, false, 'selected'))
		clas(document.querySelector('.thumbnail#' + id), true, 'selected') // add selection style
	}

	function addNewImage(files: FileList) {
		const filesArray = [...files] // fileList to Array
		let filesIdsList: string[] = []
		let selected = ''

		filesArray.forEach(() => {
			const _id = randomString(6)
			selected = _id
			filesIdsList.push(_id)
		})

		filesArray.forEach((file, i) => {
			let reader = new FileReader()

			reader.onload = function (event) {
				const result = event.target?.result as string

				if (typeof result === 'string' && isOnlineStorageAtCapacity(result)) {
					return console.warn('Uploaded image was not saved') // Exit with warning before saving image
				}

				compress(result, 'thumbnail', filesIdsList[i])
				setTimeout(() => compress(result), 1000)

				storage.local.set({ ['custom_' + filesIdsList[i]]: result })
			}

			localIsLoading = true
			reader.readAsDataURL(file)
		})

		// Adds to list, becomes selected and save background
		storage.local.get(['idsList'], (local) => {
			let list = [...local.idsList]
			list.push(...filesIdsList)

			if (local.idsList.length === 0) {
				storage.sync.set({ background_type: 'custom' }) // change type si premier local
			}

			setTimeout(() => thumbnailSelection(selected), 400)

			storage.local.set({
				...local,
				idsList: list,
				selectedId: selected,
			})
		})
	}

	function compress(file: string, state?: string, _id?: string) {
		const img = new Image()

		img.onload = () => {
			const canvas = document.createElement('canvas')
			const ctx = canvas.getContext('2d')

			if (!ctx) return

			// canvas proportionné à l'image
			// rétréci suivant le taux de compression
			// si thumbnail, toujours 140px
			const height = state === 'thumbnail' ? 140 * window.devicePixelRatio : img.height
			const scaleFactor = height / img.height
			canvas.width = img.width * scaleFactor
			canvas.height = height

			ctx.drawImage(img, 0, 0, img.width * scaleFactor, height) //dessine l'image proportionné

			const data = ctx.canvas.toDataURL(img.src) // renvoie le base64
			const cleanData = data.slice(data.indexOf(',') + 1, data.length) //used for blob

			if (state === 'thumbnail' && _id) {
				storage.local.set({ ['customThumb_' + _id]: cleanData })
				addThumbnails(cleanData, _id, null, true)

				return
			}

			b64toBlobUrl(cleanData, (bloburl: string) => {
				imgBackground(bloburl)
				clas($('creditContainer'), false, 'shown')
			})
		}

		img.src = file
	}

	function addThumbnails(data: string, _id: string, settingsDom: HTMLElement | null, isSelected: boolean) {
		const settings = settingsDom ? settingsDom : ($('settings') as HTMLElement)

		const thb = document.createElement('button')
		const rem = document.createElement('button')
		const thbimg = document.createElement('img')
		const remimg = document.createElement('img')
		const wrap = settings.querySelector('#fileContainer')

		thb.id = _id
		thb.setAttribute('class', 'thumbnail' + (isSelected ? ' selected' : ''))

		clas(rem, true, 'b_removethumb')
		clas(rem, !mobilecheck(), 'hidden')

		thb.setAttribute('aria-label', 'Select this background')
		rem.setAttribute('aria-label', 'Remove this background')

		remimg.setAttribute('alt', '')
		thbimg.setAttribute('alt', '')

		remimg.setAttribute('src', 'src/assets/interface/close.svg')
		rem.appendChild(remimg)

		b64toBlobUrl(data, (bloburl: string) => (thbimg.src = bloburl))

		thb.appendChild(thbimg)
		thb.appendChild(rem)
		wrap?.prepend(thb)

		thb.onclick = (e) => {
			if (e.button !== 0 || localIsLoading || !e.target) {
				return
			}

			const thumbnailButton = e.composedPath().find((d: EventTarget) => {
				return (d as HTMLElement).className.includes('thumbnail')
			}) as HTMLElement

			const _id = thumbnailButton.id
			const bgKey = 'custom_' + _id

			storage.local.get('selectedId', (local) => {
				// image selectionné est différente de celle affiché
				if (_id !== local.selectedId) {
					thumbnailSelection(_id)

					localIsLoading = true
					storage.local.set({ selectedId: _id }) // Change bg selectionné
					storage.local.get([bgKey], (local) => compress(local[bgKey])) //affiche l'image voulue
				}
			})
		}

		rem.onclick = (e) => {
			e.stopPropagation()

			const path = e.composedPath()

			if (e.button !== 0 || localIsLoading) {
				return
			}

			storage.local.get(['idsList', 'selectedId'], (local) => {
				const thumbnail = path.find((d: EventTarget) => {
					return (d as HTMLElement).className.includes('thumbnail')
				}) as HTMLElement

				const _id = thumbnail.id
				let { idsList, selectedId } = local
				let poppedList = idsList.filter((s: string) => !s.includes(_id))

				thumbnail.remove()

				storage.local.remove('custom_' + _id)
				storage.local.remove('customThumb_' + _id)
				storage.local.set({ idsList: poppedList })

				// Draw new image if displayed is removed
				if (_id === selectedId) {
					// To another custom
					if (poppedList.length > 0) {
						selectedId = poppedList[0]
						thumbnailSelection(selectedId)

						const toShowId = 'custom_' + poppedList[0]
						storage.local.get([toShowId], (local) => compress(local[toShowId]))
					}

					// back to unsplash
					else {
						storage.sync.set({ background_type: 'dynamic' })

						setTimeout(() => {
							clas($('creditContainer'), true, 'shown')
							storage.sync.get('dynamic', (data) => unsplash(data as Sync))
						}, 400)

						selectedId = ''
					}

					storage.local.set({ selectedId }) // selected is new chosen background
				}
			})
		}
	}

	function displayCustomThumbnails(settingsDom: HTMLElement) {
		const thumbnails = settingsDom.querySelectorAll('#bg_tn_wrap .thumbnail')

		storage.local.get(['idsList', 'selectedId'], (local) => {
			const { idsList, selectedId } = local

			if (idsList.length > 0 && thumbnails.length < idsList.length) {
				const thumbsKeys = idsList.map((id: string) => 'customThumb_' + id) // To get keys for storage

				// Parse through thumbnails to display them
				storage.local.get(thumbsKeys, (local) => {
					Object.entries(local).forEach(([key, val]) => {
						if (!key.startsWith('customThumb_')) return // online only, can be removed after lsOnlineStorage rework

						const _id = key.replace('customThumb_', '')
						const blob = val.replace('data:image/jpeg;base64,', '')
						const isSelected = _id === selectedId

						addThumbnails(blob, _id, settingsDom, isSelected)
					})
				})
			}
		})
	}

	function refreshCustom(button: HTMLSpanElement) {
		storage.sync.get('custom_every', (sync) => {
			turnRefreshButton(button, true)
			localIsLoading = true

			setTimeout(
				() =>
					localBackgrounds({
						every: sync.custom_every,
						time: 0,
					}),
				400
			)
		})
	}

	function applyCustomBackground(id: string) {
		storage.local.get(['custom_' + id], (local) => {
			const background = local['custom_' + id]

			const cleanData = background.slice(background.indexOf(',') + 1, background.length)
			b64toBlobUrl(cleanData, (bloburl: string) => {
				imgBackground(bloburl)
				clas($('creditContainer'), false, 'shown')
			})
		})
	}

	if (event) {
		if (event.is === 'thumbnail' && event.settings) displayCustomThumbnails(event.settings)
		if (event.is === 'newfile' && event.file) addNewImage(event.file)
		if (event.is === 'refresh' && event.button) refreshCustom(event.button)
		return
	}

	if (!init) {
		return
	}

	storage.local.get(['selectedId', 'idsList'], (local) => {
		try {
			// need all of saved stuff
			let { selectedId, idsList } = local
			const { every, time } = init
			const needNewImage = freqControl.get(every, time || 0)

			// 1.14.0 (firefox?) background recovery fix
			if (!idsList) {
				idsList = []
				selectedId = ''

				storage.local.get(null, (local) => {
					const ids = Object.keys(local)
						.filter((k) => k.startsWith('custom_'))
						.map((k) => k.replace('custom_', ''))

					storage.local.set({ idsList: ids, selectedId: ids[0] || '' })
					storage.sync.get(null, (data) => initBackground(data as Sync))
				})
			}

			if (idsList.length === 0) {
				storage.sync.get('dynamic', (data) => {
					unsplash(data as Sync) // no bg, back to unsplash
				})
				return
			}

			if (every && needNewImage) {
				if (idsList.length > 1) {
					idsList = idsList.filter((l: string) => !l.includes(selectedId)) // removes current from list
					selectedId = idsList[Math.floor(Math.random() * idsList.length)] // randomize from list
				}

				applyCustomBackground(selectedId)

				storage.sync.set({ custom_time: freqControl.set() })
				storage.local.set({ selectedId })

				if ($('settings')) thumbnailSelection(selectedId) // change selection if coming from refresh

				return
			}

			applyCustomBackground(selectedId)
		} catch (e) {
			errorMessage('Could not init local backgrounds', e)
		}
	})
}

export async function unsplash(
	init: Sync | null,
	event?: {
		is: string
		value?: string
		button?: HTMLSpanElement | null
	}
) {
	// TODO: Separate Collection type with users string
	type CollectionType = 'night' | 'noon' | 'day' | 'evening' | 'user'

	async function preloadImage(src: string) {
		const img = new Image()

		img.src = src
		await img.decode()
		img.remove()

		return
	}

	function imgCredits(image: UnsplashImage) {
		//
		// Filtering
		const domcredit = $('credit')
		let needsSpacer = false
		let artist = ''
		let photoLocation = ''
		let exifDescription = ''
		const referral = '?utm_source=Bonjourr&utm_medium=referral'
		const { city, country, name, username, link, exif } = image

		if (!city && !country) {
			photoLocation = tradThis('Photo by ')
		} else {
			if (city) photoLocation = city + ', '
			if (country) {
				photoLocation += country
				needsSpacer = true
			}
		}

		if (exif) {
			const orderedExifData = [
				{ key: 'model', format: `%val% - ` },
				{ key: 'aperture', format: `f/%val% ` },
				{ key: 'exposure_time', format: `%val%s ` },
				{ key: 'iso', format: `ISO %val% ` },
				{ key: 'focal_length', format: `%val%mm` },
			]

			orderedExifData.forEach(({ key, format }) => {
				if (Object.keys(exif).includes(key)) {
					const exifVal = exif[key as keyof typeof exif]

					if (exifVal) {
						exifDescription += key === 'iso' ? exifVal.toString() : format.replace('%val%', exifVal.toString())
					}
				}
			})
		}

		// Force Capitalization
		artist = name
			.split(' ')
			.map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLocaleLowerCase())
			.join(' ')

		// DOM element

		const locationDOM = document.createElement('a')
		const spacerDOM = document.createElement('span')
		const artistDOM = document.createElement('a')
		const exifDOM = document.createElement('p')

		exifDOM.className = 'exif'
		exifDOM.textContent = exifDescription
		locationDOM.textContent = photoLocation
		artistDOM.textContent = artist
		spacerDOM.textContent = ` - `

		locationDOM.href = link + referral
		artistDOM.href = 'https://unsplash.com/@' + username + referral

		if (domcredit) {
			domcredit.textContent = ''

			domcredit.appendChild(exifDOM)
			domcredit.appendChild(locationDOM)
			if (needsSpacer) domcredit.appendChild(spacerDOM)
			domcredit.appendChild(artistDOM)

			clas($('creditContainer'), true, 'shown')
		}
	}

	function loadBackground(props: UnsplashImage) {
		imgBackground(props.url, props.color)
		imgCredits(props)

		// sets meta theme-color to main background's color
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', props.color)
	}

	async function requestNewList(collecType: CollectionType) {
		const header = new Headers()
		const collecString = allCollectionType[collecType] || allCollectionType.day
		const url = `https://api.unsplash.com/photos/random?collections=${collecString}&count=8`
		header.append('Authorization', `Client-ID 3686c12221d29ca8f7947c94542025d760a8e0d49007ec70fa2c4b9f9d377b1d`)
		header.append('Accept-Version', 'v1')

		let resp: Response
		let json: JSON[]

		resp = await fetch(url, { headers: header })

		if (resp.status === 404) {
			if (collecType === 'user') {
				const defaultCollectionList: UnsplashImage[] = await requestNewList(chooseCollection() || 'day')
				return defaultCollectionList
			} else {
				return []
			}
		}

		json = await resp.json()

		if (json.length === 1) {
			const defaultCollectionList: UnsplashImage[] = await requestNewList(chooseCollection() || 'day')
			return defaultCollectionList
		}

		const filteredList: UnsplashImage[] = []
		const { width, height } = screen
		const imgSize = width > height ? width : height // higher res on mobile

		json.forEach((img: any) => {
			filteredList.push({
				url: img.urls.raw + '&w=' + imgSize + '&dpr=' + window.devicePixelRatio,
				link: img.links.html,
				username: img.user.username,
				name: img.user.name,
				city: img.location.city,
				country: img.location.country,
				color: img.color,
				exif: img.exif,
				desc: img.description,
			})
		})

		return filteredList
	}

	function chooseCollection(customCollection?: string): CollectionType {
		if (customCollection) {
			customCollection = customCollection.replaceAll(` `, '')
			allCollectionType.user = customCollection
			return 'user'
		}

		return periodOfDay(sunTime())
	}

	function collectionUpdater(dynamic: Dynamic): CollectionType {
		const { every, lastCollec, collection } = dynamic
		const pause = every === 'pause'
		const day = every === 'day'

		if ((pause || day) && lastCollec) {
			return lastCollec // Keeps same collection on >day so that user gets same type of backgrounds
		}

		const collec = chooseCollection(collection) // Or updates collection with sunTime or user collec
		dynamic.lastCollec = collec
		storage.sync.set({ dynamic: dynamic })

		return collec
	}

	async function cacheControl(dynamic: Dynamic, caches: DynamicCache, collecType: CollectionType, preloading: boolean) {
		//
		const needNewImage = freqControl.get(dynamic.every, dynamic.time)
		let list = caches[collecType]

		if (preloading) {
			loadBackground(list[0])
			await preloadImage(list[1].url) // Is trying to preload next
			storage.local.remove('waitingForPreload')
			return
		}

		if (!needNewImage) {
			loadBackground(list[0]) // No need for new, load the same image
			return
		}

		// Needs new image, Update time
		dynamic.lastCollec = collecType
		dynamic.time = freqControl.set()

		// Removes previous image from list
		if (list.length > 1) list.shift()

		// Load new image
		loadBackground(list[0])

		// If end of cache, get & save new list
		if (list.length === 1 && navigator.onLine) {
			const newList = await requestNewList(collecType)

			if (newList) {
				caches[collecType] = list.concat(newList)
				await preloadImage(newList[0].url)
				storage.local.set({ dynamicCache: caches })
				storage.local.remove('waitingForPreload')
			}

			return
		}

		if (list.length > 1) await preloadImage(list[1].url) // Or preload next

		storage.sync.set({ dynamic: dynamic })
		storage.local.set({ dynamicCache: caches })
		storage.local.remove('waitingForPreload')
	}

	async function populateEmptyList(collecType: CollectionType, cache: DynamicCache) {
		const newList = await requestNewList(collecType)
		const changeStart = performance.now()

		if (!newList) {
			return // Don't save dynamicCache if request failed, also don't preload nothing
		}

		await preloadImage(newList[0].url)
		loadBackground(newList[0])

		cache[collecType] = newList
		storage.local.set({ dynamicCache: cache })
		storage.local.set({ waitingForPreload: true })

		//preload
		await preloadImage(newList[1].url)
		storage.local.remove('waitingForPreload')
	}

	function updateDynamic(
		event: {
			is: string
			value?: string
			button?: HTMLSpanElement | null
		},
		sync: Sync,
		local: Local
	) {
		switch (event.is) {
			case 'refresh': {
				if (!event.button) return console.log('No buttons to animate')

				// Only refreshes background if preload is over
				// If not, animate button to show it is trying
				if (local.waitingForPreload === undefined) {
					turnRefreshButton(event.button, true)

					const newDynamic = { ...sync.dynamic, time: 0 }
					storage.sync.set({ dynamic: newDynamic })
					storage.local.set({ waitingForPreload: true })

					setTimeout(() => {
						cacheControl(newDynamic, local.dynamicCache, collectionUpdater(newDynamic), false)
					}, 400)

					return
				}

				turnRefreshButton(event.button, false)
				break
			}

			case 'every': {
				// Todo: fix bad manual value check
				if (!event.value || !event.value.match(/tabs|hour|day|period|pause/g)) {
					return console.log('Not valid "every" value')
				}

				sync.dynamic.every = event.value
				sync.dynamic.time = freqControl.set()
				storage.sync.set({ dynamic: sync.dynamic })
				break
			}

			// Back to dynamic and load first from chosen collection
			case 'removedCustom': {
				storage.sync.set({ background_type: 'dynamic' })
				loadBackground(local.dynamicCache[collectionUpdater(sync.dynamic)][0])
				break
			}

			// Always request another set, update last time image change and load background
			case 'collection': {
				if (!navigator.onLine || typeof event.value !== 'string') return

				// remove user collec
				if (event.value === '') {
					const defaultColl = chooseCollection()
					local.dynamicCache.user = []
					sync.dynamic.collection = ''
					sync.dynamic.lastCollec = defaultColl

					storage.sync.set({ dynamic: sync.dynamic })
					storage.local.set({ dynamicCache: local.dynamicCache })

					unsplash(sync)
					return
				}

				// add new collec
				sync.dynamic.collection = event.value
				sync.dynamic.lastCollec = 'user'
				sync.dynamic.time = freqControl.set()
				storage.sync.set({ dynamic: sync.dynamic })

				populateEmptyList(chooseCollection(event.value), local.dynamicCache)
				break
			}
		}
	}

	// collections source: https://unsplash.com/@bonjourr/collections
	const allCollectionType = {
		noon: 'GD4aOSg4yQE',
		day: 'o8uX55RbBPs',
		evening: '3M2rKTckZaQ',
		night: 'bHDh4Ae7O8o',
		user: '',
	}

	if (event) {
		// No init, Event
		storage.sync.get('dynamic', (sync) =>
			storage.local.get(['dynamicCache', 'waitingForPreload'], (local) => {
				updateDynamic(event, sync as Sync, local as Local)
			})
		)
	}

	if (!init) {
		return
	}

	storage.local.get(['dynamicCache', 'waitingForPreload'], (local) => {
		try {
			// Real init start
			const collecType = collectionUpdater(init.dynamic)
			const cache = local.dynamicCache || localDefaults.dynamicCache

			if (cache[collecType].length === 0) {
				populateEmptyList(collecType, cache) // If list empty: request new, save sync & local
				return
			}

			cacheControl(init.dynamic, cache, collecType, local.waitingForPreload) // Not empty: normal cacheControl
		} catch (e) {
			errorMessage('Dynamic errored on init', e)
		}
	})

	return
}

export function backgroundFilter(cat: 'init' | 'blur' | 'bright', val: { blur?: number; bright?: number }, isEvent?: boolean) {
	let result = ''
	const domblur = $('i_blur') as HTMLInputElement
	const dombright = $('i_bright') as HTMLInputElement

	switch (cat) {
		case 'init':
			result = `blur(${val.blur}px) brightness(${val.bright})`
			break

		case 'blur':
			result = `blur(${val.blur}px) brightness(${dombright.value})`
			break

		case 'bright':
			result = `blur(${domblur.value}px) brightness(${val.bright})`
			break
	}

	$('background')!.style.filter = result
	$('background-bis')!.style.filter = result

	if (isEvent) {
		if (cat === 'blur') eventDebounce({ background_blur: val.blur })
		if (cat === 'bright') eventDebounce({ background_bright: val.bright })
	}
}

export function darkmode(value: 'auto' | 'system' | 'enable' | 'disable', isEvent?: boolean) {
	const time = sunTime()

	if (time) {
		const cases = {
			auto: time.now <= time.rise || time.now > time.set ? 'dark' : '',
			system: 'autodark',
			enable: 'dark',
			disable: '',
		}

		document.body.setAttribute('class', cases[value])

		if (isEvent) {
			storage.sync.set({ dark: value })
		}
	}
}

export function searchbar(init: Searchbar | null, update?: any, that?: HTMLInputElement) {
	const domcontainer = $('sb_container')
	const domsearchbar = $('searchbar')
	const emptyButton = $('sb_empty')
	const submitButton = $('sb_submit')

	const display = (shown: boolean) => $('sb_container')?.setAttribute('class', shown ? 'shown' : 'hidden')
	const setEngine = (value: string) => domsearchbar?.setAttribute('data-engine', value)
	const setRequest = (value: string) => domsearchbar?.setAttribute('data-request', stringMaxSize(value, 512))
	const setNewtab = (value: boolean) => domsearchbar?.setAttribute('data-newtab', value.toString())
	const setOpacity = (value: number) => {
		if (domsearchbar) {
			domsearchbar.style.backgroundColor = `rgba(255, 255, 255, ${value})`
			domsearchbar.style.color = value > 0.4 ? '#222' : '#fff'
			clas($('sb_container'), value > 0.4, 'opaque')
		}
	}

	//
	// Updates

	function updateSearchbar() {
		storage.sync.get('searchbar', (data) => {
			if (!that) {
				return
			}

			switch (update) {
				case 'engine': {
					data.searchbar.engine = that.value
					clas($('searchbar_request'), that.value === 'custom', 'shown')
					setEngine(that.value)
					break
				}

				case 'opacity': {
					data.searchbar.opacity = parseFloat(that.value)
					setOpacity(parseFloat(that.value))
					break
				}

				case 'request': {
					let val = that.value

					if (val.indexOf('%s') !== -1) {
						data.searchbar.request = stringMaxSize(val, 512)
						that.blur()
					} else if (val.length > 0) {
						val = ''
						that.setAttribute('placeholder', tradThis('%s Not found'))
						setTimeout(() => that.setAttribute('placeholder', tradThis('Search query: %s')), 2000)
					}

					setRequest(val)
					break
				}

				case 'newtab': {
					data.searchbar.newtab = that.checked
					setNewtab(that.checked)
					break
				}
			}

			eventDebounce({ searchbar: data.searchbar })
		})
	}

	if (update) {
		updateSearchbar()
		return
	}

	//
	// Initialisation

	const { on, engine, request, newtab, opacity } = init || syncDefaults.searchbar

	try {
		display(on)
		setEngine(engine)
		setRequest(request)
		setNewtab(newtab)
		setOpacity(opacity)

		if (on) {
			domsearchbar?.focus()
		}
	} catch (e) {
		errorMessage('Error in searchbar initialization', e)
	}

	//
	// Events

	function submitSearch(e: SubmitEvent) {
		if (!domsearchbar) return
		e.preventDefault()

		let searchURL = 'https://www.google.com/search?q=%s'
		const isNewtab = domsearchbar?.dataset.newtab === 'true'
		const engine = domsearchbar?.dataset.engine || 'google'
		const request = domsearchbar?.dataset.request || ''
		const lang = document.documentElement.getAttribute('lang') || 'en'

		type EnginesKey = keyof typeof enginesUrls
		type LocalesKey = keyof typeof enginesLocales
		type LocalesLang = keyof typeof enginesLocales.google

		// is a valid engine
		if (engine in enginesUrls) {
			searchURL = enginesUrls[engine as EnginesKey]

			// has found a translation
			if (engine in enginesLocales && lang in enginesLocales[engine as LocalesKey]) {
				const selectedLocale = enginesLocales[engine as LocalesKey]
				const selectedLang = selectedLocale[lang as LocalesLang]

				searchURL = searchURL.replace('%l', selectedLang)
			}
		}
		// is custom engine
		else if (engine === 'custom') {
			searchURL = request
		}

		// add search query to url
		searchURL = searchURL.replace('%s', encodeURIComponent((domsearchbar as HTMLInputElement).value))

		// open new page
		window.open(searchURL, isNewtab ? '_blank' : '_self')
	}

	function toggleInputButton(toggle: boolean) {
		if (toggle) {
			emptyButton?.removeAttribute('disabled')
			submitButton?.removeAttribute('disabled')
		} else {
			emptyButton?.setAttribute('disabled', '')
			submitButton?.setAttribute('disabled', '')
		}
	}

	function handleInputButtons() {
		const hasText = (domsearchbar as HTMLInputElement).value.length > 0

		clas(emptyButton, hasText, 'shown')
		clas(submitButton, hasText, 'shown')
		toggleInputButton(hasText)
	}

	function removeInputText() {
		if (!domsearchbar) return

		domsearchbar.focus()
		;(domsearchbar as HTMLInputElement).value = ''

		clas(emptyButton, false, 'shown')
		clas(submitButton, false, 'shown')
		toggleInputButton(false)
	}

	// This removes duplicates in case searchbar is called multiple times
	domcontainer?.removeEventListener('submit', submitSearch)
	domsearchbar?.removeEventListener('input', handleInputButtons)
	emptyButton?.removeEventListener('click', removeInputText)

	domcontainer?.addEventListener('submit', submitSearch)
	domsearchbar?.addEventListener('input', handleInputButtons)
	emptyButton?.addEventListener('click', removeInputText)
}

export async function quotes(
	init: Sync | null,
	update?: {
		is: 'toggle' | 'author' | 'frequency' | 'type' | 'refresh' | 'userlist'
		value?: string
		checked?: boolean
	}
) {
	function userlistToQuotes(arr: [string, string][] = [['', '']]): Quote[] {
		return arr?.map(([author, content]) => ({ author, content }))
	}

	async function newQuoteFromAPI(lang: string, type: string) {
		try {
			if (!navigator.onLine) {
				return []
			}

			// Fetch a random quote from the quotes API
			const query = (type += type === 'classic' ? `/${lang}` : '')
			const response = await fetch('https://quotes.bonjourr.fr/' + query)
			const json = await response.json()

			if (response.ok) {
				return json
			}
		} catch (error) {
			console.warn(error)
			return []
		}
	}

	function insertToDom(values: Quote) {
		const quoteDOM = $('quote')
		const authorDOM = $('author')

		if (!values || !quoteDOM || !authorDOM) {
			return
		}

		quoteDOM.textContent = values.content
		authorDOM.textContent = values.author
	}

	function controlCacheList(list: Quote[], lang: string, type: string) {
		//
		// User

		if (type === 'user') {
			const randIndex = Math.round(Math.random() * (list.length - 1))
			storage.local.set({ userQuoteSelection: randIndex })
			return list[randIndex]
		}

		//
		// APIs

		list.shift() // removes used quote
		storage.local.set({ quotesCache: list })

		if (list.length < 2) {
			newQuoteFromAPI(lang, type).then((list) => {
				storage.local.set({ quotesCache: list })
			})
		}

		return list[0]
	}

	function updateSettings({
		lang,
		quotes,
		quotesCache,
	}: {
		lang: string
		quotes: Sync['quotes']
		quotesCache: Local['quotesCache']
	}) {
		async function handleQuotesType(type: string) {
			let list: Quote[] = []
			const { userlist } = quotes
			const isUserAndEmpty = type === 'user' && !userlist

			clas($('quotes_userlist'), type === 'user', 'shown')

			// Do nothing more if no list is found
			if (isUserAndEmpty) return

			// Fetch quotes from API and display
			if (type !== 'user') {
				list = await newQuoteFromAPI(lang, type)
				storage.local.set({ quotesCache: list })
				insertToDom(list[0])
				return
			}

			// User list needs local to get selection
			storage.local.get(['userQuoteSelection'], async (local) => {
				list = userlistToQuotes(userlist!)
				insertToDom(list[local.userQuoteSelection || 0])
			})
		}

		function handleUserListChange(userlist: string) {
			function validateUserQuotes(json: JSON) {
				return (
					Array.isArray(json) &&
					json.length > 0 &&
					json.every((val) => val.length === 2) &&
					json.flat().every((val) => typeof val === 'string')
				)
			}

			function inputError(log: string) {
				;($('i_qtlist') as HTMLInputElement).value = ''
				console.log(log)
			}

			let array: [string, string][] = []
			let quote: Quote = { author: '', content: '' }

			if (userlist !== '') {
				let userJSON = []

				try {
					userJSON = JSON.parse(userlist)
				} catch (error) {
					inputError('User quotes list is not valid JSON')
					return quotes.userlist
				}

				// if list is not valid, skip
				if (validateUserQuotes(userJSON) === false) {
					inputError('User quotes list is not of type [string, string][]')
					return quotes.userlist
				}

				array = userJSON
				quote = { author: array[0][0], content: array[0][1] }
			}

			$('i_qtlist')?.blur()
			insertToDom(quote)
			storage.local.set({ userQuoteSelection: 0 })

			return array
		}

		function handleQuotesRefresh() {
			if (quotes.type === 'user') {
				if (!quotes.userlist) return
				quotesCache = userlistToQuotes(quotes.userlist)
			}

			const quote = controlCacheList(quotesCache, lang, quotes.type)
			insertToDom(quote)
		}

		const updated = { ...quotes }
		const { checked, value } = update! // force because updateSettings is only called after update check

		switch (update?.is) {
			case 'author': {
				if (typeof checked !== 'boolean') return
				updated.author = checked
				clas($('author'), checked, 'alwaysVisible')
				break
			}

			case 'frequency': {
				if (!value) return
				updated.frequency = value
				break
			}

			case 'type': {
				if (!value) return
				updated.type = value
				handleQuotesType(value)
				break
			}

			case 'userlist': {
				if (typeof value !== 'string') return
				updated.userlist = handleUserListChange(value)
				break
			}

			case 'refresh': {
				updated.last = freqControl.set()
				handleQuotesRefresh()
				break
			}
		}

		storage.sync.set({ quotes: updated })
	}

	// get sync & local, update, and quit
	if (update) {
		storage.sync.get(['lang', 'quotes'], async (data) => {
			storage.local.get(['quotesCache'], async (local) => {
				const { lang, quotes } = data as Sync
				const { quotesCache } = local as Local
				updateSettings({ quotes, lang, quotesCache })
			})
		})
		return
	}

	// Cache:
	// storage.local = { quotesCache: Array(20) }
	// NeedsNewQuote: Removes first element of the list
	// if list is too small, fetches new batch of quotes
	// All quotes type share the same cache
	// changing quotes type fetches new batch

	if (!init) {
		errorMessage('No data to display Quotes !')
		return
	}

	storage.local.get(['quotesCache', 'userQuoteSelection'], async (local) => {
		const { lang, quotes } = init
		const isUser = quotes.type === 'user'
		const needsNewQuote = freqControl.get(quotes.frequency, quotes.last)

		let userSel = local.userQuoteSelection || 0
		let cache = local.quotesCache
		let quote: Quote

		canDisplayInterface('quotes')

		// First startup, create classic cache
		if (!cache || cache?.length === 0) {
			cache = await newQuoteFromAPI(lang, quotes.type)
			storage.local.set({ quotesCache: cache })
		}

		// If user quotes, replace cache
		if (isUser) {
			cache = userlistToQuotes(quotes.userlist) // force because list check is above
		}

		// Frequence control, get new quote from controlCacheList
		if (needsNewQuote) {
			quotes.last = freqControl.set() // updates last quotes timestamp
			quote = controlCacheList(cache, lang, quotes.type)
			storage.sync.set({ quotes })
		} else {
			quote = cache[isUser ? userSel : 0]
		}

		// Displays
		if (quotes.author) {
			$('author')?.classList.add('always-on')
		}

		if (isUser && quotes.userlist) insertToDom(userlistToQuotes(quotes.userlist!)[userSel])
		else if (!isUser) insertToDom(cache[0])

		insertToDom(quote)
		clas($('quotes_container'), !quotes.on, 'hidden')
	})
}

export function showPopup(value: string | number) {
	//
	function affiche() {
		const setReviewLink = () =>
			getBrowser() === 'chrome'
				? 'https://chrome.google.com/webstore/detail/bonjourr-%C2%B7-minimalist-lig/dlnejlppicbjfcfcedcflplfjajinajd/reviews'
				: getBrowser() === 'firefox'
				? 'https://addons.mozilla.org/en-US/firefox/addon/bonjourr-startpage/'
				: getBrowser() === 'safari'
				? 'https://apps.apple.com/fr/app/bonjourr-startpage/id1615431236'
				: getBrowser() === 'edge'
				? 'https://microsoftedge.microsoft.com/addons/detail/bonjourr/dehmmlejmefjphdeoagelkpaoolicmid'
				: 'https://bonjourr.fr/help#%EF%B8%8F-reviews'

		const dom = {
			wrap: document.createElement('div'),
			btnwrap: document.createElement('div'),
			desc: document.createElement('p'),
			review: document.createElement('a'),
			donate: document.createElement('a'),
		}

		const closePopup = (fromText: boolean) => {
			if (fromText) {
				$('popup')?.classList.remove('shown')
				setTimeout(() => {
					$('popup')?.remove()
					setTimeout(() => $('creditContainer')?.style.removeProperty('opacity'), 400)
				}, 200)
			}
			storage.sync.set({ reviewPopup: 'removed' })
		}

		dom.wrap.id = 'popup'
		dom.desc.id = 'popup_text'
		dom.desc.textContent = tradThis(
			'Love using Bonjourr? Consider giving us a review or donating, that would help a lot! 😇'
		)

		dom.review.href = setReviewLink()
		dom.donate.href = 'https://ko-fi.com/bonjourr'

		dom.review.textContent = tradThis('Review')
		dom.donate.textContent = tradThis('Donate')

		dom.btnwrap.id = 'popup_buttons'
		dom.btnwrap.appendChild(dom.review)
		dom.btnwrap.appendChild(dom.donate)

		dom.wrap.appendChild(dom.desc)
		dom.wrap.appendChild(dom.btnwrap)

		document.body.appendChild(dom.wrap)

		$('creditContainer')!.style.opacity = '0'

		setTimeout(() => dom.wrap.classList.add('shown'), 200)

		dom.review.addEventListener('mousedown', () => closePopup(false))
		dom.donate.addEventListener('mousedown', () => closePopup(false))
		dom.desc.addEventListener('click', () => closePopup(true), { passive: true })
	}

	// TODO: condition a verifier

	if (typeof value === 'number') {
		if (value > 30) affiche() //s'affiche après 30 tabs
		else storage.sync.set({ reviewPopup: value + 1 })

		return
	}

	if (value !== 'removed') {
		storage.sync.set({ reviewPopup: 0 })
	}
}

export function textShadow(init: number | null, event?: number) {
	const val = init ? init : event
	dominterface.style.textShadow = `1px 2px 6px rgba(0, 0, 0, ${val})`

	if (typeof event === 'number') {
		eventDebounce({ textShadow: val })
	}
}

export function customCss(init: string | null, event?: { is: 'styling' | 'resize'; val: string | number }) {
	const styleHead = $('styles') as HTMLStyleElement

	if (init) {
		styleHead.textContent = init
	}

	if (event) {
		switch (event.is) {
			case 'styling': {
				if (typeof event.val === 'string') {
					const val = stringMaxSize(event.val, 8080)
					styleHead.textContent = val
					eventDebounce({ css: val })
				}
				break
			}

			case 'resize': {
				if (typeof event.val === 'number') {
					eventDebounce({ cssHeight: event.val })
				}
				break
			}
		}
	}
}

export function hideElem(
	init: Hide | null,
	event?: { is: 'buttons' | 'hide'; buttonList?: NodeListOf<HTMLButtonElement>; button?: HTMLButtonElement }
) {
	const IDsList = [
		['time', ['time-container', 'date']],
		['main', ['greetings', 'description', 'tempContainer']],
		['linkblocks', ['linkblocks']],
		['showSettings', ['showSettings']],
	]

	// Returns { row, col } to naviguate [[0, 0], [0, 0, 0]] etc.
	const getEventListPosition = (that: HTMLButtonElement) => ({
		row: parseInt(that.getAttribute('data-row') || '0'),
		col: parseInt(that.getAttribute('data-col') || '0'),
	})

	function isEverythingHidden(list: Hide, row: number) {
		const filtered = list[row].filter((el) => el === 1)
		return filtered.length === list[row].length
	}

	function initElements(list: Hide) {
		list.forEach((row, row_i) => {
			const parent = IDsList[row_i][0] as string // [0] is always string

			if (isEverythingHidden(list, row_i)) {
				clas($(parent), true, 'he_hidden')
			}

			// Hide children
			row.forEach((child, child_i) => {
				const id = IDsList[row_i][1][child_i]
				if (!!child) {
					clas($(id), true, 'he_hidden')
				}
			})
		})
	}

	function initButtons() {
		storage.sync.get('hide', (data) => {
			try {
				data.hide = validateHideElem(data.hide) ? data.hide : [[0, 0], [0, 0, 0], [0], [0]]
				event?.buttonList?.forEach((button) => {
					const pos = getEventListPosition(button)
					if (data.hide[pos.row][pos.col] === 1) button.classList.toggle('clicked')
				})
			} catch (e) {
				errorMessage('Hide buttons failed', e)
			}
		})
	}

	function toggleElement() {
		storage.sync.get(['weather', 'hide'], (data) => {
			data.hide = validateHideElem(data.hide) ? data.hide : [[0, 0], [0, 0, 0], [0], [0]]

			if (!event?.button) {
				return
			}

			const pos = getEventListPosition(event.button)
			const state = event.button.classList.contains('clicked')
			const child = IDsList[pos.row][1][pos.col]
			const parent = IDsList[pos.row][0] as string

			// Update hidden list
			data.hide[pos.row][pos.col] = state ? 1 : 0
			storage.sync.set({ hide: data.hide })

			// Re-activates weather
			if (!state && pos.row === 1 && pos.col > 0 && 'weather' in data) {
				weather(data as Sync)
			}

			// Toggle children and parent if needed
			clas($(child), state, 'he_hidden')
			clas($(parent), isEverythingHidden(data.hide, pos.row), 'he_hidden')
		})
	}

	if (event) {
		if (event.is === 'buttons' && event.buttonList) initButtons()
		if (event.is === 'hide' && event.button) toggleElement()
		return
	}

	if (init && validateHideElem(init)) {
		try {
			initElements(init)
		} catch (e) {
			errorMessage('Hide failed on init', e)
		}
	}
}

export function sunTime(init?: Weather) {
	if (init && init.lastState) {
		sunrise = init.lastState.sunrise
		sunset = init.lastState.sunset
	}

	if (sunset === 0) {
		return {
			now: minutator(new Date()),
			rise: 420,
			set: 1320,
		}
	}

	return {
		now: minutator(new Date()),
		rise: minutator(new Date(sunrise * 1000)),
		set: minutator(new Date(sunset * 1000)),
	}
}

export function filterImports(data: any) {
	// TODO: Somehow type filterImports

	let result = { ...syncDefaults, ...data }

	// Hide elem classes changed at some point
	if (validateHideElem(data.hide)) {
		const weatherIndex = data.hide.indexOf('weather_desc')
		const widgetIndex = data.hide.indexOf('w_icon')

		if (weatherIndex >= 0) data.hide[weatherIndex] = 'description'
		if (widgetIndex >= 0) data.hide[widgetIndex] = 'widget'
	} else {
		data.hide = [[0, 0], [0, 0, 0], [0], [0]]
	}

	// <1.9.0 searchbar options was boolean
	if (typeof data.searchbar === 'boolean') {
		result.on = data.searchbar
		result.newtab = data.searchbar_newtab || false
		result.engine = data.searchbar_engine ? data.searchbar_engine.replace('s_', '') : 'google'
	}

	// Filter links to remove alias and give random ids
	try {
		function linksFilter(sync: any) {
			const aliasKeyList = Object.keys(sync).filter((key) => key.match('alias:'))

			sync.links?.forEach(({ title, url, icon }: Link, i: number) => {
				const id = 'links' + randomString(6)
				const filteredIcon = icon.startsWith('alias:') ? sync[icon] : icon

				sync[id] = { _id: id, order: i, title, icon: filteredIcon, url }
			})

			aliasKeyList.forEach((key) => delete sync[key]) // removes <1.13.0 aliases
			delete sync.links // removes <1.13.0 links array

			return sync
		}
		result = linksFilter(result)
	} catch (e) {
		errorMessage('Messed up in filter imports', e)
	}

	return result
}

export function canDisplayInterface(cat: keyof typeof functionsLoad | null, init?: Sync) {
	//
	// Progressive anim to max of Bonjourr animation time
	function displayInterface() {
		const domshowsettings = $('showSettings') as HTMLDivElement
		let loadtime = performance.now() - loadtimeStart

		if (loadtime > 400) loadtime = 400
		loadtime = loadtime < 33 ? 0 : 400

		domshowsettings.style.transition = `opacity ${loadtime}ms`
		dominterface.style.transition = `opacity ${loadtime}ms, transform .4s`
		dominterface.style.opacity = '1'

		clas(domshowsettings, true, 'enabled')

		setTimeout(() => {
			dominterface.classList.remove('init')
			domshowsettings.classList.remove('init')
			domshowsettings.style.transition = ``

			storage.sync.get(null, (data) => settingsInit(data as Sync))
		}, loadtime + 100)
	}

	// More conditions if user is using advanced features
	if (init || !cat) {
		if (init?.font?.family && init?.font?.url) functionsLoad.fonts = 'Waiting'
		if (init?.quotes?.on) functionsLoad.quotes = 'Waiting'
		return
	}

	if (functionsLoad[cat] === 'Off') {
		return // Function is not activated, don't wait for it
	}

	functionsLoad[cat] = 'Ready'

	if (Object.values(functionsLoad).includes('Waiting') === false && !$('settings')) {
		displayInterface()
	}
}

function onlineAndMobileHandler() {
	//

	if (mobilecheck()) {
		// For Mobile that caches pages for days
		document.addEventListener('visibilitychange', () => {
			storage.sync.get(['dynamic', 'waitingForPreload', 'weather', 'background_type', 'hide'], (data) => {
				const { dynamic, background_type } = data
				const dynamicNeedsImage = background_type === 'dynamic' && freqControl.get(dynamic.every, dynamic.time)

				if (dynamicNeedsImage) {
					unsplash(data as Sync)
				}

				clock(data as Sync)
				sunTime(data.weather)
				weather(data as Sync)
			})
		})
	}

	// Only on Online / Safari
	if (detectPlatform() === 'online') {
		//
		// Update export code on localStorage changes

		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js')
		}

		// PWA install trigger (30s interaction default)
		let promptEvent
		window.addEventListener('beforeinstallprompt', function (e) {
			promptEvent = e
			return promptEvent
		})

		// Firefox cannot -moz-fill-available with height
		// On desktop, uses fallback 100vh
		// On mobile, sets height dynamically because vh is bad on mobile
		if (getBrowser('firefox') && mobilecheck()) {
			const appHeight = () => document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
			appHeight()

			// Resize will crush page when keyboard opens
			// window.addEventListener('resize', appHeight)

			// Fix for opening tabs Firefox iOS
			if (testOS.ios) {
				let globalID: number

				function triggerAnimationFrame() {
					appHeight()
					globalID = requestAnimationFrame(triggerAnimationFrame)
				}

				window.requestAnimationFrame(triggerAnimationFrame)
				setTimeout(() => cancelAnimationFrame(globalID), 500)
			}
		}
	}
}

function startup(data: Sync) {
	traduction(null, data.lang)
	canDisplayInterface(null, data)

	sunTime(data.weather)
	weather(data)

	customFont(data.font)
	textShadow(data.textShadow)

	favicon(data.favicon)
	tabTitle(data.tabtitle)
	clock(data)
	darkmode(data.dark)
	searchbar(data.searchbar)
	quotes(data)
	showPopup(data.reviewPopup)
	notes(data.notes || null)
	moveElements(data.move)

	customCss(data.css)
	hideElem(data.hide)
	initBackground(data)
	quickLinks(data)

	setInterval(() => {
		if (navigator.onLine) {
			storage.sync.get(['weather', 'hide'], (data) => {
				weather(data as Sync) // Checks every 5 minutes if weather needs update
			})
		}
	}, 300000)
}

type FunctionsLoadState = 'Off' | 'Waiting' | 'Ready'

const dominterface = $('interface') as HTMLDivElement,
	functionsLoad: { [key: string]: FunctionsLoadState } = {
		clock: 'Waiting',
		links: 'Waiting',
		fonts: 'Off',
		quotes: 'Off',
	}

let localIsLoading = false,
	loadtimeStart = performance.now(),
	sunset = 0,
	sunrise = 0

window.onload = function () {
	onlineAndMobileHandler()

	try {
		storage.sync.get(null, (data) => {
			const VersionChange = data?.about?.version !== syncDefaults.about.version
			const isImport = sessionStorage.isImport === 'true'
			const firstStart = Object.keys(data).length === 0

			if (firstStart) {
				data = syncDefaults
				storage.local.set(localDefaults)
				storage.sync.set(data)
			}
			//
			else if (isImport) {
				sessionStorage.removeItem('isImport')

				data = filterImports(data)
				data.about = { browser: detectPlatform(), version: syncDefaults.about.version }

				storage.sync.clear()
				storage.sync.set(data)
			}
			//
			else if (VersionChange) {
				const oldV = data?.about?.version
				const newV = syncDefaults.about.version

				console.log(`Version change: ${oldV} => ${newV}`)

				if (newV === '1.16.0') {
					localStorage.hasUpdated = 'true'
				}

				storage.sync.set({ about: { browser: detectPlatform(), version: newV } })
			}

			startup(data as Sync) // TODO: rip type checking
		})
	} catch (e) {
		errorMessage('Could not load chrome storage on startup', e)
	}
}
