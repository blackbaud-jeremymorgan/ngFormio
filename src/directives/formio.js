module.exports = function() {
  return {
    restrict: 'E',
    replace: true,
    scope: {
      src: '=?',
      formAction: '=?',
      form: '=?',
      submission: '=?',
      readOnly: '=?',
      hideComponents: '=?',
      requireComponents: '=?',
      disableComponents: '=?',
      formioOptions: '=?',
      options: '=?'
    },
    controller: [
      '$scope',
      '$http',
      '$element',
      'FormioScope',
      'Formio',
      'FormioUtils',
      function(
        $scope,
        $http,
        $element,
        FormioScope,
        Formio,
        FormioUtils
      ) {
        $scope._src = $scope.src || '';
        $scope.formioAlerts = [];
        // Shows the given alerts (single or array), and dismisses old alerts
        this.showAlerts = $scope.showAlerts = function(alerts) {
          $scope.formioAlerts = [].concat(alerts);
        };

        // Add the live form parameter to the url.
        if ($scope._src && ($scope._src.indexOf('live=') === -1)) {
          $scope._src += ($scope._src.indexOf('?') === -1) ? '?' : '&';
          $scope._src += 'live=1';
        }

        // Build the display map.
        $scope.show = {};
        var boolean = {
          'true': true,
          'false': false
        };

        // The list of all conditionals.
        var _conditionals = {};

        // The list of all custom conditionals, segregated because they must be run on every change to data.
        var _customConditionals = {};

        /**
         * Sweep all the components and build the conditionals map.
         *
         * @private
         */
        var _sweepConditionals = function() {
          $scope.form.components = $scope.form.components || [];
          FormioUtils.eachComponent($scope.form.components, function(component) {
            if (!component.hasOwnProperty('key')) {
              return;
            }

            // Show everything by default.
            $scope.show[component.key] = true;

            // We only care about valid/complete conditional settings.
            if (
              component.conditional
              && (component.conditional.show !== null && component.conditional.show !== '')
              && (component.conditional.when !== null && component.conditional.when !== '')
            ) {
              // Default the conditional values.
              component.conditional.show = boolean.hasOwnProperty(component.conditional.show)
                ? boolean[component.conditional.show]
                : true;
              component.conditional.eq = component.conditional.eq || '';

              // Keys should be unique, so don't worry about clobbering an existing duplicate.
              _conditionals[component.key] = component.conditional;
            }
            // Custom conditional logic.
            else if (component.customConditional) {
              // Add this customConditional to the conditionals list.
              _customConditionals[component.key] = component.customConditional;
            }

            // Set hidden if specified
            if ($scope.hideComponents) {
              component.hidden = $scope.hideComponents.indexOf(component.key) !== -1;
            }

            // Set required if specified
            if ($scope.requireComponents && component.hasOwnProperty('validate')) {
              component.validate.required = $scope.requireComponents.indexOf(component.key) !== -1;
            }

            // Set disabled if specified
            if ($scope.disableComponents) {
              component.disabled = $scope.disableComponents.indexOf(component.key) !== -1;
            }
          }, true);
        };

        /**
         * Using the conditionals map, invoke the conditionals for each component.
         *
         * @param {String} componentKey
         *   The component to toggle conditional logic for.
         *
         * @private
         */
        var _toggleConditional = function(componentKey) {
          if (_conditionals.hasOwnProperty(componentKey)) {
            var cond = _conditionals[componentKey];
            var value = $scope.submission.data[cond.when];

            if (typeof value !== 'undefined' && typeof value !== 'object') {
              // Check if the conditional value is equal to the trigger value
              $scope.show[componentKey] = value.toString() === cond.eq.toString()
                ? boolean[cond.show]
                : !boolean[cond.show];
            }
            // Special check for check boxes component.
            else if (typeof value !== 'undefined' && typeof value === 'object') {
              $scope.show[componentKey] = boolean.hasOwnProperty(value[cond.eq])
                ? boolean[value[cond.eq]]
                : true;
            }
            // Check against the components default value, if present and the components hasnt been interacted with.
            else if (typeof value === 'undefined' && cond.hasOwnProperty('defaultValue')) {
              $scope.show[componentKey] = cond.defaultValue.toString() === cond.eq.toString()
                ? boolean[cond.show]
                : !boolean[cond.show];
            }
            // If there is no value, we still need to process as not equal.
            else {
              $scope.show[componentKey] = !boolean[cond.show];
            }
          }
        };

        /**
         * Using the custom conditionals map, invoke the conditionals for each component.
         *
         * @param {String} componentKey
         *   The component to toggle conditional logic for.
         *
         * @private
         */
        var _toggleCustomConditional = function(componentKey) {
          if (_customConditionals.hasOwnProperty(componentKey)) {
            var cond = _customConditionals[componentKey];
            var value = $scope.submission.data[cond.when];

            try {
              // Create a child block, and expose the submission data.
              var data = $scope.submission.data; // eslint-disable-line no-unused-vars
              // Eval the custom conditional and update the show value.
              var show = eval('(function() { ' + cond.toString() + '; return show; })()');
              // Show by default, if an invalid type is given.
              $scope.show[componentKey] = boolean.hasOwnProperty(show.toString()) ? boolean[show] : true;
            }
            catch (e) {
              $scope.show[componentKey] = true;
            }
          }
        };

        // Update the components on the initial form render.
        var load = _.once(function() {
          _sweepConditionals();

          // Toggle every conditional.
          var allConditionals = Object.keys(_conditionals);
          _.forEach(allConditionals || [], function(componentKey) {
            _toggleConditional(componentKey);
          });

          var allCustomConditionals = Object.keys(_customConditionals);
          _.forEach(allCustomConditionals || [], function(componentKey) {
            _toggleCustomConditional(componentKey);
          });
        });
        var update = _.throttle(function() {
          load();

          // Toggle every conditional.
          var allConditionals = Object.keys(_conditionals);
          _.forEach(allConditionals || [], function(componentKey) {
            _toggleConditional(componentKey);
          });

          var allCustomConditionals = Object.keys(_customConditionals);
          _.forEach(allCustomConditionals || [], function(componentKey) {
            _toggleCustomConditional(componentKey);
          });
        }, 1000);
        $scope.$watchCollection('submission.data', update);

        if (!$scope._src) {
          $scope.$watch('src', function(src) {
            if (!src) {
              return;
            }
            $scope._src = src;
            $scope.formio = FormioScope.register($scope, $element, {
              form: true,
              submission: true
            });
          });
        }

        // Create the formio object.
        $scope.formio = FormioScope.register($scope, $element, {
          form: true,
          submission: true
        });

        // Called when the form is submitted.
        $scope.onSubmit = function(form) {
          if (!form.$valid || form.submitting) return;
          form.submitting = true;

          // Create a sanitized submission object.
          var submissionData = {data: {}};
          if ($scope.submission._id) {
            submissionData._id = $scope.submission._id;
          }
          if ($scope.submission.data._id) {
            submissionData._id = $scope.submission.data._id;
          }

          var grabIds = function(input) {
            if (!input) {
              return [];
            }

            if (!(input instanceof Array)) {
              input = [input];
            }

            var final = [];
            input.forEach(function(element) {
              if (element && element._id) {
                final.push(element._id);
              }
            });

            return final;
          };

          var defaultPermissions = {};
          FormioUtils.eachComponent($scope.form.components, function(component) {
            if (component.type === 'resource' && component.key && component.defaultPermission) {
              defaultPermissions[component.key] = component.defaultPermission;
            }
            if ($scope.submission.data.hasOwnProperty(component.key) && $scope.show[component.key]) {
              var value = $scope.submission.data[component.key];
              if (component.type === 'number') {
                submissionData.data[component.key] = value ? parseFloat(value) : 0;
              }
              else {
                submissionData.data[component.key] = value;
              }
            }
          });

          angular.forEach($scope.submission.data, function(value, key) {
            if (value && !value.hasOwnProperty('_id')) {
              submissionData.data[key] = value;
            }

            // Setup the submission access.
            var perm = defaultPermissions[key];
            if (perm) {
              submissionData.access = submissionData.access || [];

              // Coerce value into an array for plucking.
              if (!(value instanceof Array)) {
                value = [value];
              }

              // Try to find and update an existing permission.
              var found = false;
              submissionData.access.forEach(function(permission) {
                if (permission.type === perm) {
                  found = true;
                  permission.resources = permission.resources || [];
                  permission.resources.concat(grabIds(value));
                }
              });

              // Add a permission, because one was not found.
              if (!found) {
                submissionData.access.push({
                  type: perm,
                  resources: grabIds(value)
                });
              }
            }
          });

          // Show the submit message and say the form is no longer submitting.
          var onSubmit = function(submission, message) {
            $scope.showAlerts({
              type: 'success',
              message: message
            });
            form.submitting = false;
          };

          // Called when a submission has been made.
          var onSubmitDone = function(method, submission) {
            var message = '';
            if ($scope.options && $scope.options.submitMessage) {
              message = $scope.options.submitMessage;
            }
            else {
              message = 'Submission was ' + ((method === 'put') ? 'updated' : 'created') + '.';
            }
            onSubmit(submission, message);
            // Trigger the form submission.
            $scope.$emit('formSubmission', submission);
          };

          // Allow the form to be completed externally.
          $scope.$on('submitDone', function(event, submission, message) {
            onSubmit(submission, message);
          });

          // Allow an error to be thrown externally.
          $scope.$on('submitError', function(event, error) {
            FormioScope.onError($scope, $element)(error);
          });

          var submitEvent = $scope.$emit('formSubmit', submissionData);
          if (submitEvent.defaultPrevented) {
            // Listener wants to cancel the form submission
            form.submitting = false;
            return;
          }

          // Make sure to make a copy of the submission data to remove bad characters.
          submissionData = angular.copy(submissionData);

          // Allow custom action urls.
          if ($scope.action) {
            var method = submissionData._id ? 'put' : 'post';
            $http[method]($scope.action, submissionData).success(function(submission) {
              Formio.clearCache();
              onSubmitDone(method, submission);
            }).error(FormioScope.onError($scope, $element))
              .finally(function() {
                form.submitting = false;
              });
          }

          // If they wish to submit to the default location.
          else if ($scope.formio) {
            // copy to remove angular $$hashKey
            $scope.formio.saveSubmission(submissionData, $scope.formioOptions).then(function(submission) {
              onSubmitDone(submission.method, submission);
            }, FormioScope.onError($scope, $element)).finally(function() {
              form.submitting = false;
            });
          }
          else {
            $scope.$emit('formSubmission', submissionData);
          }
        };
      }
    ],
    templateUrl: 'formio.html'
  };
};
