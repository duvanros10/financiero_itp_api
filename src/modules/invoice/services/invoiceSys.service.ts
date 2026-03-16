import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isEmpty } from 'lodash';
import * as moment from 'moment';
import { NotFoundError } from '../../../classes/httpError/notFounError';
import { UnprocessableEntity } from '../../../classes/httpError/unProcessableEntity';

import { DeepPartial, EntityManager, QueryRunner, Repository } from 'typeorm';
import { IInfoInvoice } from '../../../interfaces/enrollment.interface';
import { IDescriptionSys } from '../../../interfaces/payment.interface';
import {
  calcularSubTotal,
  generateDescriptionSys,
} from '../../../utils/invoice.util';
import { getVerificationGigit } from '../../../utils/nitConverter.util';
import {
  COD_DET_FACTURA_SQL,
  COD_FACTURA_SQL,
  COD_TERCERO_SQL,
} from '../constant/invoiceSql.constant';

import { Invoice } from '../entities/invoice.entity';
import { Person } from '../entities/person.entity';
import { DetailInvoiceSys } from '../entities/SysApolo/detailInvoiceSys.entity';
import { InvoiceSys } from '../entities/SysApolo/invoiceSys.entity';
import { PaymentPointSys } from '../entities/SysApolo/paymentPointSys.entity';
import { ThirdPartySys } from '../entities/SysApolo/thirdPartySys.entity';
import { ESysApoloStatus } from '../enums/invoice.enum';
import { databaseProviders } from '../providers/database.provider';
import { DetailPaymentRepository } from '../repositories/detailPayment.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InvoiceSysService {
  private invoiceSysRepository: Repository<InvoiceSys>;
  private detailInvoiceSysRepository: Repository<DetailInvoiceSys>;
  private thirdPartySysRepository: Repository<ThirdPartySys>;
  private paymentPointSysRepository: Repository<PaymentPointSys>;

  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly detailPaymentRepository: DetailPaymentRepository,
    private configService: ConfigService,
  ) {
    databaseProviders.useFactory(this.configService).then(
      (dataSource) => {
        this.invoiceSysRepository = dataSource.getRepository(InvoiceSys);
        this.detailInvoiceSysRepository =
          dataSource.getRepository(DetailInvoiceSys);
        this.thirdPartySysRepository = dataSource.getRepository(ThirdPartySys);
        this.paymentPointSysRepository =
          dataSource.getRepository(PaymentPointSys);
      },
      () => null,
    );
  }

  // Main register Invoice
  async registerInvoiceSysApolo(invoiceIdParam: number): Promise<boolean> {
    const dataSource = await databaseProviders.useFactory(this.configService);
    const queryRunner = dataSource.createQueryRunner();
    try {
      const invoice = await this.invoiceRepository.findById(invoiceIdParam);
      if (!invoice)
        throw new NotFoundError(`Factura ${invoiceIdParam} no encontrada`);

      const { person, id: invoiceId } = invoice;
      let codTer = '00000';

      if (!person.codMunicipio) {
        throw new UnprocessableEntity(
          `El estudiante debe tener municipio de residencia configurado`,
        );
      }

      const [invoiceSys] = await this.invoiceSysRepository?.find({
        where: { numRecibo: invoiceId },
      });

      await queryRunner.connect();
      await queryRunner.startTransaction();

      if (invoiceSys) {
        try {
          await this.invoiceRepository.updateStatusVerifySys(
            ESysApoloStatus.REGISTRADO,
            invoiceId,
          );
        } catch (error) {
          console.log(error);
        }
        throw new UnprocessableEntity(
          `La factura ${invoiceId} ya se encuentra en sysApolo`,
        );
      }

      const [thirdParty] = await this.thirdPartySysRepository?.find({
        where: { numIdentificacion: invoice.estudianteId },
      });

      if (!thirdParty) {
        codTer = await this.createThirdParty(queryRunner.manager, person);
      } else {
        await this.updateThirdParty(queryRunner, person);
        codTer = thirdParty.id;
      }

      await this.createInvoiceSys(queryRunner, invoice, codTer);

      await queryRunner.commitTransaction();
      if (!queryRunner.isReleased) await queryRunner.release();
      try {
        await this.invoiceRepository.updateStatusVerifySys(
          ESysApoloStatus.REGISTRADO,
          invoiceId,
        );
      } catch (error) {
        console.log(error);
      }
      return true;
    } catch (error) {
      console.log(error.toString());
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        if (!queryRunner.isReleased) await queryRunner.release();
      }

      throw new HttpException(
        { ...error, response: error.toString() },
        HttpStatus.UNPROCESSABLE_ENTITY,
        {
          cause: error.toString(),
        },
      );
    }
  }

  async updateThirdParty(dbSys: QueryRunner, person: Person | null) {
    const { documentType, apellido1, apellido2, nombre1, nombre2 } = person;
    const fullName = `${apellido1} ${apellido2 ?? ''} ${nombre1} ${
      nombre2 ?? ''
    }`;
    const thirdPartyUpdate: DeepPartial<ThirdPartySys> = {
      idTipoIdentificacion: documentType.codSysapolo,
      email: person.email,
      nomTercero: fullName.trim(),
      priApellido: apellido1,
      segApellido: apellido2 ?? '',
      priNombre: nombre1?.split(' ')[0] ?? '',
      otrNombre: nombre2?.split(' ')[0] ?? '',
      dirTercero: person.direccion,
      telTercero: person.phone,
      ideMun: person.codMunicipio,
    };

    await dbSys.manager
      .createQueryBuilder()
      .update(ThirdPartySys)
      .set(thirdPartyUpdate)
      .where('numIdentificacion = :id', { id: person.id })
      .execute();
  }

  async createInvoiceSys(dbSys: QueryRunner, invoice: Invoice, codTer: string) {
    const { jsonResponse, categoryInvoice } = invoice;
    const detailInvoices =
      invoice.detailInvoices.filter((detailInvoice) => {
        return calcularSubTotal(detailInvoice) > 0;
      }) || [];

    if (!jsonResponse)
      throw new NotFoundError('Falta información de matricula en la factura ');

    const { info_cliente: infoStudet }: IInfoInvoice = JSON.parse(jsonResponse);

    const payment = await this.detailPaymentRepository.findPaymentOkByInvoiceId(
      invoice.id,
    );

    if (!payment) throw new NotFoundError('No se encontro pagos en la factura');

    const { bankAccount } = payment;

    const [paymentPoint] = await this.paymentPointSysRepository?.find({
      where: {
        numCuentaBanco: bankAccount.cuentaBanco,
        anioPuntoPago: moment(payment.fecha).year(),
      },
    });

    if (!paymentPoint)
      throw new NotFoundError('No se encontro el punto de pago en sysAPolo');

    const codInvoiceQuery = await this.invoiceSysRepository?.query(
      COD_FACTURA_SQL,
    );

    const codDetInvoiceQuery = await this.invoiceSysRepository?.query(
      COD_DET_FACTURA_SQL,
    );

    if (isEmpty(codInvoiceQuery) || isEmpty(codDetInvoiceQuery))
      throw new NotFoundError(
        'No se ha podido generar el codigo para crear la factura',
      );

    const dataDescriptiom: IDescriptionSys = {
      category: categoryInvoice.descripcion,
      formPayment: payment.formOfPayment.descripcion,
      program: infoStudet.nom_nivel_educativo,
      transactionCode: payment.codigoTransaccion,
      datePayment: moment(payment.fecha).format('YYYY-MM-DD HH:mm:ss'),
    };

    const invoiceSys: DeepPartial<InvoiceSys> = {
      id: codInvoiceQuery[0].cod_factura ?? null,
      numRecibo: invoice.id,
      fecRecibo: payment.fecha,
      codTercero: codTer,
      ideUsuario: 41, //always 41
      detRecibo: generateDescriptionSys(dataDescriptiom),
      valorConcepto: payment.valorPago,
      valorRecaudo: payment.valorPago,
      pagado: 'S',
      ideBanco: 2, //TODO: puntos de pago
      codColegio: infoStudet.cod_colegio,
      codFormaPago: payment.formaPagoId,
      codNivelEducativo: infoStudet.cod_nivel_educativo,
      codPuntoPago: paymentPoint.id,
      creaRegistro: '1',
    };

    const insertInvoice = dbSys.manager.create(InvoiceSys, invoiceSys);

    await dbSys.manager.insert(InvoiceSys, insertInvoice);
    let idDet = codDetInvoiceQuery[0].cod_det_factura ?? 0;

    const inserDetailInvoice = detailInvoices.map<
      DeepPartial<DetailInvoiceSys>
    >((detail) => {
      const {
        cantidad,
        concept: { codSysapolo },
        valorUnidad,
      } = detail;
      idDet++;
      return {
        id: idDet,
        facturaId: codInvoiceQuery[0].cod_factura ?? null,
        conceptoId: codSysapolo,
        cantidad,
        valorConcepto: valorUnidad,
        subTotal: calcularSubTotal(detail),
        idContabilidadDebitoCausacion: -1,
        idContabilidadCreditoCausacion: -1,
        idEncabezadoContabilidadCausacion: -1,
        idContabilidadDebitoRecaudo: -1,
        idContabilidadCreditoRecaudo: -1,
        idEncabezadoContabilidadRecaudo: -1,
        idePresupuestoRecurso: -1,
        codCentroCostoDebCausacion: '-1',
        codCentroCostoCreCausacion: '-1',
        codCentroCostoDebRecaudo: '-1',
        codCentroCostoCreRecaudo: '-1',
      };
    });

    await dbSys.manager.insert(DetailInvoiceSys, inserDetailInvoice);
  }

  async createThirdParty(
    dbSys: EntityManager,
    person: Person,
  ): Promise<string> {
    const { documentType, apellido1, apellido2, nombre1, nombre2 } = person;
    const nombre2Safe = nombre2 ?? '';

    if (nombre2Safe.length > 15) {
    }

    const codTerSql = await this.thirdPartySysRepository?.query(
      COD_TERCERO_SQL,
    );

    if (isEmpty(codTerSql))
      throw new NotFoundError(
        'No se ha podido generar el codigo para crear el tercero',
      );

    const digVer = getVerificationGigit(person.id);
    const codTer: string = codTerSql[0].cod_ter ?? '00000';

    const fullName = `${apellido1} ${
      apellido2 ?? ''
    } ${nombre1} ${nombre2Safe}`;

    const thirdPartyCreate: DeepPartial<ThirdPartySys> = {
      id: codTer,
      idTipoIdentificacion: documentType.codSysapolo,
      nitTercero: `${person.id}-${digVer}`,
      numIdentificacion: person.id,
      digVerificacion: digVer,
      email: person.email,
      nomTercero: fullName.trim(),
      priApellido: apellido1,
      segApellido: apellido2 ?? '',
      priNombre: nombre1.split(' ')[0] ?? '',
      otrNombre: nombre2Safe.split(' ')[0] ?? '',
      claTercero: 'S',
      dirTercero: person.direccion,
      telTercero: person.phone,
      ideMun: person.codMunicipio,
      sexTercero: person.genero,
      estTercero: '1',
      fecIngreso: new Date(),
      salarioMensual: 0,
      tipTercero: '4',
    };
    await dbSys.insert(ThirdPartySys, thirdPartyCreate);
    return codTer;
  }

  async deleteInvoiceSysApolo(invoiceId: number): Promise<boolean> {
    try {
      const [invoiceSys] = await this.invoiceSysRepository?.find({
        where: { numRecibo: invoiceId },
      });
      await this.detailInvoiceSysRepository?.delete({
        facturaId: invoiceSys.id,
      });
      await this.invoiceSysRepository?.delete({ id: invoiceSys.id });
      return true;
    } catch (error) {
      return false;
    }
  }

  async registerInvoiceMasive() {
    const invoices = await this.invoiceRepository.getPaidInvoiceLimit(100);

    let success = 0;
    let fail = 0;

    for (const { id } of invoices) {
      try {
        await this.registerInvoiceSysApolo(id);
        success++;
      } catch (error) {
        console.log(error);
        fail++;
      }
    }

    return { success, fail };
  }
}
