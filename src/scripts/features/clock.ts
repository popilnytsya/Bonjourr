import { tradThis, $, clas, errorMessage } from '../utils'
import { canDisplayInterface } from '..'
import { months, days } from '../lang'
import storage from '../storage'

import { Sync, ClockFace } from '../types/sync'

let lazyClockInterval = setTimeout(() => {}, 0)

export default function clock(
	init: Sync | null,
	event?: {
		is: 'analog' | 'seconds' | 'face' | 'ampm' | 'timezone' | 'usdate' | 'greeting'
		value?: string
		checked?: boolean
	}
) {
	//
	type Clock = {
		ampm: boolean
		analog: boolean
		seconds: boolean
		face: string
		timezone: string
	}

	function zonedDate(timezone: string = 'auto') {
		const date = new Date()

		if (timezone === 'auto') return date

		const offset = date.getTimezoneOffset() / 60
		const utcHour = date.getHours() + offset
		date.setHours(utcHour + parseInt(timezone))

		return date
	}

	function clockDate(date: Date, usdate: boolean) {
		const jour = tradThis(days[date.getDay()]),
			mois = tradThis(months[date.getMonth()]),
			chiffre = date.getDate()

		$('date')!.textContent = usdate ? `${jour}, ${mois} ${chiffre}` : `${jour} ${chiffre} ${mois}`
	}

	function greetings(date: Date, name?: string) {
		const greets = [
			{ text: 'Good night', hour: 7 },
			{ text: 'Good morning', hour: 12 },
			{ text: 'Good afternoon', hour: 18 },
			{ text: 'Good evening', hour: 24 },
		]

		const domgreetings = $('greetings') as HTMLTitleElement
		const greetResult = greets.filter((greet) => date.getHours() < greet.hour)[0]

		domgreetings.style.textTransform = name ? 'none' : 'capitalize'
		domgreetings.textContent = tradThis(greetResult.text) + (name ? `, ${name}` : '')
	}

	function changeAnalogFace(face: ClockFace = 'none') {
		//
		// Clockwise
		const chars = {
			none: ['', '', '', ''],
			number: ['12', '3', '6', '9'],
			roman: ['XII', 'III', 'VI', 'IX'],
			marks: ['│', '─', '│', '─'],
		}

		document
			.querySelectorAll('#analogClock .numbers')
			.forEach((mark, i) => (mark.textContent = chars[face as keyof typeof chars][i]))
	}

	function startClock(clock: Clock, greeting: string, usdate: boolean) {
		//
		function displayControl() {
			const numeric = $('clock'),
				analog = $('analogClock'),
				analogSec = $('analogSeconds')

			//cache celle qui n'est pas choisi
			clas(numeric, clock.analog, 'hidden')
			clas(analog, !clock.analog, 'hidden')

			//cache l'aiguille des secondes
			clas(analogSec, !clock.seconds && clock.analog, 'hidden')
		}

		function clockInterval() {
			//

			function numerical(date: Date) {
				//seul numerique a besoin du ampm
				function toAmpm(val: number) {
					if (val > 12) val -= 12
					else if (val === 0) val = 12
					else val

					return val
				}

				function fixunits(val: number) {
					let res = val < 10 ? '0' + val.toString() : val.toString()
					return res
				}

				let h = clock.ampm ? toAmpm(date.getHours()) : date.getHours(),
					m = fixunits(date.getMinutes()),
					s = fixunits(date.getSeconds())

				$('clock')!.textContent = `${h}:${m}${clock.seconds ? ':' + s : ''}`
			}

			function analog(date: Date) {
				function rotation(that: HTMLSpanElement, val: number) {
					that.style.transform = `rotate(${val}deg)`
				}

				let s = date.getSeconds() * 6,
					m = date.getMinutes() * 6,
					h = date.getHours() * 30

				//bouge les aiguilles minute et heure quand seconde ou minute arrive à 0
				if (true || date.getMinutes() === 0) rotation($('minutes')!, m)
				if (true || date.getHours() === 0) rotation($('hours')!, h)

				//tourne pas les secondes si pas de seconds
				if (clock.seconds) rotation($('analogSeconds')!, s)
			}

			// Control
			const date = zonedDate(clock.timezone)
			clock.analog ? analog(date) : numerical(date)

			// Midnight, change date
			if (date.getHours() === 0 && date.getMinutes() === 0) {
				clockDate(date, usdate)
			}

			// Hour change
			if (date.getMinutes() === 0) {
				greetings(date, greeting)
			}
		}

		//stops multiple intervals
		clearInterval(lazyClockInterval)

		displayControl()
		clockInterval()
		lazyClockInterval = setInterval(clockInterval, 1000)
	}

	if (event) {
		storage.sync.get(['clock', 'usdate', 'greeting'], (data) => {
			let clock = data.clock || {
				analog: false,
				seconds: false,
				ampm: false,
				timezone: 'auto',
				face: 'none',
			}

			switch (event.is) {
				case 'usdate': {
					clockDate(zonedDate(data.clock.timezone), event.checked || false)
					storage.sync.set({ usdate: event.checked })
					break
				}

				case 'greeting': {
					greetings(zonedDate(data.clock.timezone), event.value)
					storage.sync.set({ greeting: event.value })
					break
				}

				case 'timezone': {
					clockDate(zonedDate(event.value), data.usdate)
					greetings(zonedDate(event.value), data.greeting)
					clock.timezone = event.value
					break
				}

				case 'ampm':
					clock.ampm = event.checked
					break

				case 'analog':
					clock.analog = event.checked
					break

				case 'face':
					clock.face = event.value as ClockFace
					break

				case 'seconds':
					clock.seconds = event.checked
					break
			}

			storage.sync.set({ clock })
			startClock(clock, data.greeting, data.usdate)
			changeAnalogFace(clock.face)
		})

		return
	}

	let clock = init?.clock || {
		analog: false,
		seconds: false,
		ampm: false,
		timezone: 'auto',
		face: 'none',
	}

	try {
		startClock(clock, init?.greeting || '', init?.usdate || false)
		clockDate(zonedDate(clock.timezone), init?.usdate || false)
		greetings(zonedDate(clock.timezone), init?.greeting || '')
		changeAnalogFace(clock.face)
		canDisplayInterface('clock')
	} catch (e) {
		errorMessage('Clock or greetings failed at init', e)
	}
}
