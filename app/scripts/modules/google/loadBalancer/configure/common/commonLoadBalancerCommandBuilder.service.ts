import {module, IPromise} from 'angular';
import * as _ from 'lodash';

import {ACCOUNT_SERVICE, AccountService, IAccount} from 'core/account/account.service';
import {
  LOAD_BALANCER_READ_SERVICE, LoadBalancerReader,
  ILoadBalancersByAccount
} from 'core/loadBalancer/loadBalancer.read.service';
import {SUBNET_READ_SERVICE, SubnetReader, ISubnet} from 'core/subnet/subnet.read.service';
import {GCE_HEALTH_CHECK_READER, GceHealthCheckReader} from 'google/healthCheck/healthCheck.read.service';
import {INetwork} from 'core/network/network.read.service';
import {IGceHealthCheck} from 'google/domain/healthCheck';
import {GCE_CERTIFICATE_READER, GceCertificateReader, IGceCertificate} from 'google/certificate/certificate.reader';

export class GceCommonLoadBalancerCommandBuilder {
  private dataFetchers: { [key: string]: Function } = {
    existingLoadBalancerNamesByAccount: (): IPromise<_.Dictionary<any>> => {
      return this.loadBalancerReader.listLoadBalancers('gce')
        .then((loadBalancerList: ILoadBalancersByAccount[]) => {
          return _.chain(loadBalancerList)
            .map('accounts')
            .flatten()
            .groupBy('name') // account name
            .mapValues((regionWrappers) => _.chain(regionWrappers)
              .map('regions')
              .flatten()
              .map('loadBalancers')
              .flatten()
              .map('name') // load balancer name
              .value())
            .value();
        });
    },
    accounts: (): IPromise<IAccount[]> => this.accountService.listAccounts('gce'),
    networks: (): IPromise<INetwork[]> => this.networkReader.listNetworksByProvider('gce'),
    subnets: (): IPromise<ISubnet[]> => this.subnetReader.listSubnetsByProvider('gce'),
    healthChecks: (): IPromise<IGceHealthCheck[]> => this.gceHealthCheckReader.listHealthChecks(),
    certificates: (): IPromise<IGceCertificate[]> => this.gceCertificateReader.listCertificates(),
  };

  static get $inject() { return ['$q',
                                 'loadBalancerReader',
                                 'accountService',
                                 'subnetReader',
                                 'gceHealthCheckReader',
                                 'networkReader',
                                 'gceCertificateReader']; }

  constructor(private $q: ng.IQService,
              private loadBalancerReader: LoadBalancerReader,
              private accountService: AccountService,
              private subnetReader: SubnetReader,
              private gceHealthCheckReader: GceHealthCheckReader,
              private networkReader: any,
              private gceCertificateReader: GceCertificateReader) { }

  public getBackingData(dataTypes: string[]): IPromise<any> {
    let promises = dataTypes.reduce((promisesByDataType: { [dataType: string]: IPromise<any> }, dataType: string) => {
      if (this.dataFetchers[dataType]) {
        promisesByDataType[dataType] = this.dataFetchers[dataType]();
      }
      return promisesByDataType;
    }, {});

    return this.$q.all(promises);
  }

  public groupHealthChecksByAccountAndType(healthChecks: IGceHealthCheck[]): {[account: string]: {[healthCheckType: string]: IGceHealthCheck[]}} {
    return _.chain(healthChecks)
      .groupBy('account')
      .mapValues((grouped: IGceHealthCheck[]) => _.groupBy(grouped, 'healthCheckType'))
      .value();
  }

  public groupHealthCheckNamesByAccount(healthChecks: IGceHealthCheck[], namesToOmit: string[]): {[account: string]: string[]} {
    return _.chain(healthChecks)
      .groupBy('account')
      .mapValues((grouped: IGceHealthCheck[]) => _.chain(grouped).map('name').difference(namesToOmit).value())
      .value() as {[account: string]: string[]};
  }
}

export const GCE_COMMON_LOAD_BALANCER_COMMAND_BUILDER = 'spinnaker.gce.commonLoadBalancerCommandBuilder.service';

module(GCE_COMMON_LOAD_BALANCER_COMMAND_BUILDER, [
  ACCOUNT_SERVICE,
  LOAD_BALANCER_READ_SERVICE,
  GCE_CERTIFICATE_READER,
  SUBNET_READ_SERVICE,
  GCE_HEALTH_CHECK_READER,
]).service('gceCommonLoadBalancerCommandBuilder', GceCommonLoadBalancerCommandBuilder);
