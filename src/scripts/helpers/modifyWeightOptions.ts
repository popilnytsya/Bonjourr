import { $ } from '../utils'

export default function modifyWeightOptions(weights: string[], settingsDom?: HTMLElement) {
	const select = (settingsDom ? settingsDom : ($('settings') as HTMLElement)).querySelector('#i_weight')
	const options = select?.querySelectorAll('option')

	if ((!weights || weights.length === 0) && options) {
		options.forEach((option) => (option.style.display = 'block'))
		return true
	}

	// Theres weights
	else {
		// filters
		if (weights.includes('regular')) weights[weights.indexOf('regular')] = '400'
		weights = weights.map((aa) => aa)

		// toggles selects
		if (options) {
			options.forEach((option) => (option.style.display = weights.indexOf(option.value) !== -1 ? 'block' : 'none'))
		}
	}
}
