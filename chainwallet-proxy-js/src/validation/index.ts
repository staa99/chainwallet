import { ensureEnvironmentVariables } from './environment'

const validators = {
  environment: {
    checkEnvironment: (): void => {
      console.log('Checking environment')
      ensureEnvironmentVariables()
      console.log('Environment OK!')
    },
  },
}

export default validators
